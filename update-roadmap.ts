 import { readdirSync, readFileSync, writeFileSync } from 'fs';
 import { join } from 'path';

 const ROADMAP_PATH = 'ROADMAP.md';
 const TODOS_DIR = '.pi/todos';

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

    const openItems = items.filter(item => item.status === 'open');

    openItems.sort((a, b) => a.title.localeCompare(b.title));
     const markdown = "# Project Roadmap\n\n" + 
      openItems.map(item => `- [${item.title}](.pi/todos/${item.file})`).join('\n') + 
       "\n";

     writeFileSync(ROADMAP_PATH, markdown);
     console.log('ROADMAP.md updated successfully.');
   } catch (error) {
     console.error('Error updating roadmap:', error);
   }
 }

 updateRoadmap();
