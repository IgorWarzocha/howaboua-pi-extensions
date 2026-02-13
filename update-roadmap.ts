 import { readdirSync, readFileSync, writeFileSync } from 'fs';
 import { join } from 'path';
 
 const ROADMAP_PATH = 'ROADMAP.md';
 const TODOS_DIR = 'roadmap';
 
 function updateRoadmap() {
   try {
     const files = readdirSync(TODOS_DIR).filter(f => f.endsWith('.md'));
     const items: { title: string; file: string; status: string }[] = [];
 
     for (const file of files) {
       const content = readFileSync(join(TODOS_DIR, file), 'utf8');
       const match = content.match(/^\{[\s\S]*?\n\}/);
       if (match) {
         try {
           const fm = JSON.parse(match[0]);
           items.push({
             title: fm.title || 'Untitled',
             file: file,
             status: fm.status || 'open'
           });
         } catch (e) {
           // Skip malformed
         }
       }
     }
 
     // Sort by status (open first) then title
     items.sort((a, b) => {
       if (a.status !== b.status) {
         if (a.status === 'open') return -1;
         if (b.status === 'open') return 1;
       }
       return a.title.localeCompare(b.title);
     });
 
     const markdown = "# Project Roadmap\n\n" + 
       items.map(item => `- [${item.title}](roadmap/${item.file}) (${item.status})`).join('\n') + 
       "\n";
 
     writeFileSync(ROADMAP_PATH, markdown);
     console.log('ROADMAP.md updated successfully.');
   } catch (error) {
     console.error('Error updating roadmap:', error);
   }
 }
 
 updateRoadmap();
