import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting script...");

const envPath = path.resolve(__dirname, '../.env');
console.log(`Reading env from: ${envPath}`);

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = value.trim();
            if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseAnonKey = value.trim();
        }
    });
} catch (e) {
    console.error("Error reading .env file:", e);
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials.");
  console.log("URL:", supabaseUrl);
  // console.log("Key:", supabaseAnonKey); // Don't log key
} else {
    console.log("Credentials found. URL:", supabaseUrl);

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function testConnection() {
      console.log("Testing Supabase connection...");
      const start = Date.now();
      try {
        // Check user_profiles
        const { count: usersCount, error: usersError } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });
        
        if (usersError) console.error("user_profiles Error:", usersError);
        else console.log(`user_profiles: OK (${usersCount} rows)`);

        // Check returns
        const { count: returnsCount, error: returnsError } = await supabase
            .from('returns')
            .select('*', { count: 'exact', head: true });
        
        if (returnsError) console.error("returns Error:", returnsError);
        else console.log(`returns: OK (${returnsCount} rows)`);

        // Check returned_items
        const { count: itemsCount, error: itemsError } = await supabase
            .from('returned_items')
            .select('*', { count: 'exact', head: true });

        if (itemsError) console.error("returned_items Error:", itemsError);
        else console.log(`returned_items: OK (${itemsCount} rows)`);

        console.log(`Connection test completed in ${Date.now() - start}ms`);

      } catch (err) {
        console.error("Unexpected error:", err);
      }
    }

    testConnection();
}