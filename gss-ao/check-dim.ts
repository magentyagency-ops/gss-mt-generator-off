import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key);

async function check() {
    const { data, error } = await admin.rpc('get_embedding_dim', {}); // If such RPC exists, or just try an insert
    
    // Instead, let's insert a dummy row to see what error we get.
    const { error: err } = await admin.from('rag_chunk').insert({
        chunk_id: 'test-dim',
        text: 'test',
        embedding: new Array(1536).fill(0.1),
        source: 'TEST',
        categorie: 'TEST'
    });
    console.log("Insert 1536 dim:", err);
    
    const { error: err2 } = await admin.from('rag_chunk').insert({
        chunk_id: 'test-dim2',
        text: 'test',
        embedding: new Array(1024).fill(0.1),
        source: 'TEST',
        categorie: 'TEST'
    });
    console.log("Insert 1024 dim:", err2);
    
    // clean up
    await admin.from('rag_chunk').delete().in('chunk_id', ['test-dim', 'test-dim2']);
}
check();
