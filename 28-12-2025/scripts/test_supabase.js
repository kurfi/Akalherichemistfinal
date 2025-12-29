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
      console.log("Testing Supabase connection (user_profiles)...");
      const start = Date.now();
      try {
        // Attempt a simple count query
        const { count, error } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });
        
        const duration = Date.now() - start;
        if (error) {
          console.error("Supabase Error:", error);
        } else {
          console.log(`Connection successful! Ping took ${duration}ms`);
          console.log(`Row count in 'user_profiles': ${count}`);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
      }
    }

    testConnection();
}