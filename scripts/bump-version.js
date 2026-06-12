import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packagePath = path.join(__dirname, '../package.json');

try {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const oldVersion = pkg.version;
  
  const versionParts = oldVersion.split('.').map(Number);
  if (versionParts.length === 3 && !versionParts.some(isNaN)) {
    // Incrementar automáticamente el parche (última sección)
    versionParts[2] += 1;
    pkg.version = versionParts.join('.');
    
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`\x1b[32m%s\x1b[0m`, `[Auto-Bump] ¡Versión incrementada automáticamente de v${oldVersion} a v${pkg.version}!`);
  } else {
    console.warn(`[Auto-Bump] Formato de versión semver inválido en package.json: ${oldVersion}`);
  }
} catch (error) {
  console.error('[Auto-Bump] Error al actualizar la versión automáticamente:', error);
}
