import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    // 1. Verify Service Role Key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
        return NextResponse.json(
            { error: "Configuration Error: Missing SUPABASE_SERVICE_ROLE_KEY or URL." },
            { status: 500 }
        );
    }

    // 2. Initialize Admin Client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    try {
        const body = await req.json();
        const { email, password, fullName, username, isAdmin } = body;

        if (!email || !password || !fullName || !username) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        // 3. Create User in Auth
        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm
            user_metadata: {
                full_name: fullName,
                username: username,
                role: isAdmin ? 'admin' : 'user'
            }
        });

        if (createError) {
            return NextResponse.json({ error: createError.message }, { status: 400 });
        }

        if (!userData.user) {
            return NextResponse.json({ error: "Failed to create user object" }, { status: 500 });
        }

        // 4. Insert into Profiles (Extra safety, though trigger should handle it if setup)
        // We do this to ensure data consistency in case trigger fails or isn't set up yet.
        // However, if trigger exists, this might cause duplicate key error?
        // UPSERT (on conflict do nothing/update) is safer.
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userData.user.id,
                email: email,
                username: username,
                full_name: fullName,
                role: isAdmin ? 'admin' : 'user',
                updated_at: new Date().toISOString()
            });

        if (profileError) {
            console.error("Profile creation error:", profileError);
            // We don't fail the request if auth user was created, but we warn
            return NextResponse.json({
                message: "User created in Auth but profile sync failed. Check database logs.",
                user: userData.user
            }, { status: 201 });
        }

        return NextResponse.json({ message: "User created successfully", user: userData.user }, { status: 201 });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
