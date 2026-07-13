import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import ping from 'ping';

// Force dynamic execution, otherwise Next.js might cache the API response
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Try ICMP ping first, then HTTP fallback
async function checkHost(ipAddress: string): Promise<{ alive: boolean; method: string; detail: string }> {
  // 1. Try ICMP ping
  try {
    const res = await ping.promise.probe(ipAddress, {
      timeout: 4,
    });

    if (res.alive) {
      return { alive: true, method: 'icmp', detail: `ICMP OK - ${res.time}ms` };
    }
  } catch (e: any) {
    console.log(`[Ping] ICMP failed for ${ipAddress}:`, e?.message);
  }

  // 2. Fallback: try HTTP/HTTPS connectivity check
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const httpRes = await fetch(`http://${ipAddress}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects, just check if we get ANY response
    });
    clearTimeout(timeoutId);

    // Any response (even 4xx/5xx) means the host is reachable
    return { alive: true, method: 'http', detail: `HTTP ${httpRes.status}` };
  } catch {
    // HTTP also failed
  }

  // 3. Fallback: try HTTPS
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const httpsRes = await fetch(`https://${ipAddress}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timeoutId);

    return { alive: true, method: 'https', detail: `HTTPS ${httpsRes.status}` };
  } catch {
    // All methods failed
  }

  return { alive: false, method: 'none', detail: 'All checks failed (ICMP + HTTP + HTTPS)' };
}

export async function GET() {
  try {
    console.log('--- CRON: Pinging Network Links ---');
    // 1. Fetch all links
    const { data: links, error: fetchError } = await supabase
      .from('network_links')
      .select('*');

    if (fetchError) {
      console.error('CRON PING: Erro ao buscar links: ', fetchError);
      return NextResponse.json({ error: 'Database fetch error' }, { status: 500 });
    }

    if (!links || links.length === 0) {
      return NextResponse.json({ message: 'No links to monitor.' });
    }

    // 2. Check each link concurrently
    const results = await Promise.all(
      links.map(async (link) => {
        try {
          const check = await checkHost(link.ip_address);
          
          const currentStatus = check.alive ? 'up' : 'down';
          const hasStatusChanged = link.last_status !== currentStatus;

          console.log(`[Ping] ${link.name} (${link.ip_address}): ${currentStatus.toUpperCase()} via ${check.method} - ${check.detail}`);

          return {
            link,
            currentStatus,
            hasStatusChanged,
            debug: check,
          };
        } catch (pingError: any) {
          console.error(`Erro ao verificar ${link.ip_address}:`, pingError);
          return {
            link,
            currentStatus: 'down',
            hasStatusChanged: link.last_status !== 'down',
            debug: { alive: false, method: 'error', detail: pingError?.message || 'Unknown error' },
          };
        }
      })
    );

    // 3. Process changes
    // IMPORTANTE (orçamento de I/O Supabase free): só escrevemos quando o status
    // realmente muda. Gravar todos os links a cada chamada gera dead tuples +
    // autovacuum constante e esgota o burst de I/O do plano free.
    const newEvents: any[] = [];
    const changedLinks: { id: any; currentStatus: string }[] = [];

    for (const res of results) {
      if (res.hasStatusChanged) {
        newEvents.push({
          link_id: res.link.id,
          status: res.currentStatus,
        });
        changedLinks.push({ id: res.link.id, currentStatus: res.currentStatus });
        console.log(`[Ping] STATUS CHANGED: ${res.link.name} (${res.link.ip_address}) is now ${res.currentStatus.toUpperCase()}`);
      }
    }

    // 4. Perform database operations — apenas para linhas que mudaram
    if (newEvents.length > 0) {
      const { error: eventError } = await supabase
        .from('network_events')
        .insert(newEvents);

      if (eventError) {
        console.error('CRON PING: Erro ao inserir novos eventos: ', eventError);
      }
    }

    for (const c of changedLinks) {
      const { error: updateError } = await supabase
        .from('network_links')
        .update({ last_status: c.currentStatus, last_checked: new Date().toISOString() })
        .eq('id', c.id);

      if (updateError) {
        console.error('CRON PING: Erro ao atualizar status do link: ', updateError);
      }
    }

    return NextResponse.json({
      message: 'Ping cycle completed',
      processed: links.length,
      statusChanges: newEvents.length,
      results: results.map(r => ({
        name: r.link.name,
        ip: r.link.ip_address,
        status: r.currentStatus,
        changed: r.hasStatusChanged,
        debug: r.debug,
      })),
    });
    
  } catch (err: any) {
    console.error('CRON PING: Unhandled error: ', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
