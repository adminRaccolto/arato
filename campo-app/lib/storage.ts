import * as FileSystem from 'expo-file-system';
import { supabase, SUPABASE_URL } from './supabase';

// Faz upload de uma imagem local (uri) para o bucket 'arquivos' do Supabase
// e retorna a URL pública, ou null em caso de erro.
export async function uploadFoto(uri: string, pasta: string): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const fileName = `${pasta}/${Date.now()}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Converte base64 → ArrayBuffer via fetch
    const resp = await fetch(`data:image/jpeg;base64,${base64}`);
    const blob = await resp.blob();

    const uploadResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/arquivos/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': `image/${ext}`,
          'x-upsert': 'true',
        },
        body: blob,
      },
    );

    if (!uploadResp.ok) return null;

    const { data } = supabase.storage.from('arquivos').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}
