// Server-only configuration. Clients cannot choose a database or storage token.
export function collegeConfigs(env = process.env) {
  if (!env.SEVATRACK_COLLEGES) return [];
  const entries = JSON.parse(env.SEVATRACK_COLLEGES);
  if (!Array.isArray(entries) || !entries.length || entries.length > 100) throw new Error('Invalid college configuration');
  const ids = new Set(), hosts = new Set(), databases = new Set(), stores = new Set();
  return entries.map(entry => {
    if (!entry || !/^[a-z0-9-]{1,64}$/.test(entry.id) || ids.has(entry.id)) throw new Error('Invalid or duplicate college ID');
    ids.add(entry.id);
    if (!Array.isArray(entry.hosts) || !entry.hosts.length) throw new Error('College hosts are required');
    const names = entry.hosts.map(host => {
      if (typeof host !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) || hosts.has(host)) throw new Error('Invalid or duplicate college hostname');
      hosts.add(host); return host;
    });
    const secret = key => {
      if (typeof key !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(key) || key.startsWith('NEXT_PUBLIC_') || !env[key]) throw new Error('College credentials are missing');
      return env[key];
    };
    const url = secret(entry.databaseUrlEnv), authToken = secret(entry.databaseTokenEnv), blobToken = secret(entry.blobTokenEnv);
    const parsed = new URL(url);
    if (!['libsql:', 'https:', 'file:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid college database URL');
    if (parsed.protocol === 'file:' && env.NODE_ENV === 'production') throw new Error('College databases must be persistent');
    const databaseKey = parsed.protocol === 'file:' ? url : parsed.host.toLowerCase();
    // Tokens for a store can be rotated; compare store identifiers, not whole tokens.
    const store = /^vercel_blob_rw_([^_]+)_/.exec(blobToken)?.[1];
    if (!store || databases.has(databaseKey) || stores.has(store.toLowerCase())) throw new Error('Each college requires a separate database and private Blob store');
    databases.add(databaseKey); stores.add(store.toLowerCase());
    return {id: entry.id, hosts: names, url, authToken, blobToken};
  });
}
