import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log("Testing students query...");
  const { data, error } = await supabase
    .from('students')
    .select('*');
  console.log("Error:", error);
  console.log("Data:", data);
  
  console.log("Testing specific student with class_id embed...");
  const { data: d2, error: e2 } = await supabase
    .from('students')
    .select('*, classes(*)')
    .eq('id', 1)
    .maybeSingle();
    
  console.log("Error 2:", e2);
  console.log("Data 2:", d2);
}

test();
