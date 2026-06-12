import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import NodeID3 from 'node-id3';

// Recorre carpetas recursivamente buscando archivos de audio
function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : 
      callback(path.join(dir, f));
  });
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

export function generateLibraryXml(baseFolders, onProgress, customName = null) {
  return new Promise((resolve, reject) => {
    try {
      const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
      const tracks = [];

      // Si por error llega un string en lugar de array, lo convertimos
      const folders = Array.isArray(baseFolders) ? baseFolders : [baseFolders];

      folders.forEach(folder => {
        if (fs.existsSync(folder)) {
          walkDir(folder, (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (audioExtensions.includes(ext)) {
              tracks.push(filePath);
              if (tracks.length % 100 === 0 && onProgress) {
                 onProgress({ count: tracks.length, status: 'scaneando' });
              }
            }
          });
        }
      });

      if (onProgress) onProgress({ count: tracks.length, status: 'generando_xml' });

      let xmlContent = `<?xml version="1.0" encoding="utf-8"?>\n<TrackList>\n`;
      
      tracks.forEach(filePath => {
        const filename = path.basename(filePath);
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
        let artist = "";
        let title = "";
        
        try {
          const tags = NodeID3.read(filePath);
          if (tags) {
            artist = tags.artist || "";
            title = tags.title || "";
          }
        } catch(e) {
          // ignore
        }

        if (!artist || !title) {
          if (nameWithoutExt.includes('-')) {
            const parts = nameWithoutExt.split('-');
            artist = artist || parts[0].trim();
            title = title || parts.slice(1).join('-').trim();
          } else {
            artist = artist || "Desconocido";
            title = title || nameWithoutExt;
          }
        }

        xmlContent += `  <Track FILENAME="${escapeXml(filePath)}" ARTIST="${escapeXml(artist)}" TITLE="${escapeXml(title)}" DURATION="0" />\n`;
      });

      xmlContent += `</TrackList>`;

      // Guardar en la carpeta de usuario de KSM
      const userDataPath = app.getPath('userData');
      const libraryDir = path.join(userDataPath, 'Libraries');
      if (!fs.existsSync(libraryDir)) {
        fs.mkdirSync(libraryDir, { recursive: true });
      }

      // Generar nombre de archivo basado en el nombre personalizado o en la carpeta seleccionada
      let folderName = 'ksm_library';
      if (customName && customName.trim() !== '') {
        folderName = customName;
      } else if (folders.length === 1) {
        folderName = path.basename(folders[0]) || 'ksm_library';
      } else if (folders.length > 1) {
        folderName = 'ksm_library_multiple';
      }
      
      const outputFilename = `${folderName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.xml`;
      const outputPath = path.join(libraryDir, outputFilename);

      fs.writeFileSync(outputPath, xmlContent, 'utf-8');

      resolve({
        success: true,
        count: tracks.length,
        outputPath: outputPath,
        libraryDir: libraryDir
      });

    } catch (err) {
      console.error('[LibraryScanner] Error generating XML:', err);
      reject(err);
    }
  });
}
