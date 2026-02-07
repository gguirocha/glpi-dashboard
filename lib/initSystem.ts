import { createClient } from "@supabase/supabase-js";

export async function ensureSystemReady() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
        console.error("System Init: Missing Service Role Key or URL. Admin auto-creation skipped.");
        return;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    try {
        // 1. Check if Admin user exists by Email (Supabase primary key)
        // We use a predefined email for the 'admin' user since Supabase requires emails.
        const ADMIN_EMAIL = "admin@glpi.local";
        const ADMIN_USERNAME = "admin";
        const ADMIN_PASS = "admin"; // User requested 'admin' as password

        // List users to find by email
        // Note: listUsers() returns a paginated list. For init, we check specifically.
        // Actually, simply trying to Create and catching "User already exists" is more robust and atomic.

        console.log("System Init: Checking Admin user...");

        const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASS,
            email_confirm: true,
            user_metadata: {
                username: ADMIN_USERNAME,
                full_name: "Administrador do Sistema",
                role: "admin"
            }
        });

        if (createError) {
            if (createError.message.includes("already registered") || createError.status === 422) {
                console.log("System Init: Admin user already exists.");
                // Optional: Ensure profile exists even if user exists (idempotency for profile)
                // We'd need to fetch the user ID first.
            } else {
                console.error("System Init: Failed to create admin user:", createError.message);
            }
        } else if (user) {
            console.log("System Init: Admin user created successfully.");

            // Ensure profile exists (Double check, confusing triggers sometimes)
            const { error: profileError } = await adminClient
                .from('profiles')
                .upsert({
                    id: user.id,
                    email: ADMIN_EMAIL,
                    username: ADMIN_USERNAME,
                    full_name: "Administrador do Sistema",
                    role: "admin",
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

            if (profileError) console.error("System Init: Error syncing admin profile:", profileError);
        }

    } catch (err) {
        console.error("System Init: Exception during initialization:", err);
    }
}
