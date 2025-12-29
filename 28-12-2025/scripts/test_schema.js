import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log("Script starting...");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

console.log("Reading .env from:", envPath);

try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envConfig = {};
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envConfig[key.trim()] = value.trim().replace(/"/g, '');
    }
  });

  const supabaseUrl = envConfig.VITE_SUPABASE_URL;
  const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Env Vars");
    process.exit(1);
  }

  console.log("Supabase URL:", supabaseUrl);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  async function inspect() {
      console.log("Testing Products Schema...");
      
      // Test 1: Try camelCase
      console.log("Attempt 1: camelCase (minStockLevel)");
      const testProductCamel = {
          name: 'Test Camel',
          barcode: 'CAMEL1',
          category: 'Test',
          price: 100,
          minStockLevel: 5,
          updated_at: new Date().toISOString()
      };
      
      const { data: d1, error: camelError } = await supabase.from('products').insert(testProductCamel).select();
      if (camelError) {
          console.log("❌ Insert with camelCase failed:", camelError.message);
      } else {
          console.log("✅ Insert with camelCase SUCCESS!");
          // Cleanup
          await supabase.from('products').delete().eq('id', d1[0].id);
          return;
      }

      // Test 2: Try snake_case
      console.log("Attempt 2: snake_case (min_stock_level)");
      const testProductSnake = {
          name: 'Test Snake',
          barcode: 'SNAKE1',
          category: 'Test',
          price: 100,
          min_stock_level: 5,
          updated_at: new Date().toISOString()
      };

      const { data: d2, error: snakeError } = await supabase.from('products').insert(testProductSnake).select();
      if (snakeError) {
          console.log("❌ Insert with snake_case failed:", snakeError.message);
      } else {
          console.log("✅ Insert with snake_case SUCCESS!");
          // Cleanup
          await supabase.from('products').delete().eq('id', d2[0].id);
      }
  }

  inspect().catch(err => console.error("Inspect failed:", err));

} catch (e) {
  console.error("Error reading .env:", e);
}