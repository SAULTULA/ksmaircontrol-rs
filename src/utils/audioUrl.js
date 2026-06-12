/* src/utils/audioUrl.js */
export const resolveAudioUrl = (filePath, supabaseUrl) => {
  if (!filePath) return '';
  // Si ya es una URL absoluta (https://), devolverla tal cual
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
  // Normalize Windows backslashes to forward slashes
  const cleanedPath = filePath.replace(/\\/g, '/');
  
  // Si es una ruta absoluta local (ej: C:/ o E:/ o empieza con / en linux/mac)
  if (/^[a-zA-Z]:\//.test(cleanedPath) || cleanedPath.startsWith('/')) {
    return encodeURI(`ksm:///${cleanedPath}`);
  }

  if (supabaseUrl && supabaseUrl.startsWith('https://')) {
    const base = supabaseUrl.replace(/\/$/, '').replace(/\/rest\/v1\/?$/i, '');
    // Public bucket "locuciones"
    return `${base}/storage/v1/object/public/locuciones/${cleanedPath}`;
  }
  
  // Development fallback using the internal ksm scheme
  return encodeURI(`ksm:///${cleanedPath}`);
};
