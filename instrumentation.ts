// This file runs ONCE when the Next.js server starts (both dev and production).
// We use it to set up a background ping timer so no external CRON is needed.

export async function register() {
  // Only run on the server (Node.js runtime), not on Edge
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Starting background ping scheduler...');

    // Wait 10 seconds for the server to fully start before first ping
    setTimeout(() => {
      runPingCycle();

      // Then run every 60 seconds
      setInterval(runPingCycle, 60_000);
    }, 10_000);
  }
}

async function runPingCycle() {
  try {
    // Dynamically import to avoid bundling issues
    const { createClient } = await import('@supabase/supabase-js');
    const pingModule = await import('ping');
    const ping = pingModule.default;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[PingScheduler] Missing Supabase credentials, skipping.');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch all links
    const { data: links, error: fetchError } = await supabase
      .from('network_links')
      .select('*');

    if (fetchError || !links || links.length === 0) {
      return; // No links to monitor, silently skip
    }

    // 2. Check each link
    const results = await Promise.all(
      links.map(async (link: any) => {
        let alive = false;
        let method = 'none';
        let detail = '';

        // Try ICMP ping
        try {
          const res = await ping.promise.probe(link.ip_address, { timeout: 4 });
          if (res.alive) {
            alive = true;
            method = 'icmp';
            detail = `${res.time}ms`;
          }
        } catch { /* ICMP failed */ }

        // Fallback: HTTP
        if (!alive) {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 4000);
            await fetch(`http://${link.ip_address}`, { method: 'HEAD', signal: controller.signal, redirect: 'manual' });
            clearTimeout(tid);
            alive = true;
            method = 'http';
          } catch { /* HTTP failed */ }
        }

        // Fallback: HTTPS
        if (!alive) {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 4000);
            await fetch(`https://${link.ip_address}`, { method: 'HEAD', signal: controller.signal, redirect: 'manual' });
            clearTimeout(tid);
            alive = true;
            method = 'https';
          } catch { /* HTTPS failed */ }
        }

        const currentStatus = alive ? 'up' : 'down';
        const hasStatusChanged = link.last_status !== currentStatus;

        return { link, currentStatus, hasStatusChanged, method, detail };
      })
    );

    // 3. Process results
    const updates: any[] = [];
    const newEvents: any[] = [];

    for (const res of results) {
      if (res.hasStatusChanged) {
        newEvents.push({ link_id: res.link.id, status: res.currentStatus });
        console.log(`[PingScheduler] STATUS CHANGED: ${res.link.name} (${res.link.ip_address}) → ${res.currentStatus.toUpperCase()} via ${res.method}`);
      }

      updates.push({
        id: res.link.id,
        name: res.link.name,
        ip_address: res.link.ip_address,
        last_status: res.currentStatus,
        last_checked: new Date().toISOString(),
      });
    }

    // 4. Save to database
    if (newEvents.length > 0) {
      await supabase.from('network_events').insert(newEvents);
    }
    if (updates.length > 0) {
      await supabase.from('network_links').upsert(updates);
    }
  } catch (err) {
    console.error('[PingScheduler] Error:', err);
  }
}
