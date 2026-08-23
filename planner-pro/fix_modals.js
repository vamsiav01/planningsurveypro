const fs = require('fs');
let code = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');

function replaceInModals(text) {
  let newCode = text;
  
  const modals = [
    'activeClickLoc &&',
    'showFormBuilder &&',
    'showShareModal &&',
    'showAddLayerModal &&',
    'showShapeToLayerModal &&',
    'showEditLayerModal && editingLayer &&',
    'showEditShapeModal && editingShape &&'
  ];
  
  for (const modal of modals) {
    const startIndex = newCode.indexOf('{' + modal);
    if (startIndex === -1) {
      console.log('Could not find', modal);
      continue;
    }
    
    let endIndex = newCode.length;
    const nextModalIndex = newCode.indexOf('{show', startIndex + 10);
    const endReturnIndex = newCode.indexOf('</DashboardLayout>', startIndex);
    
    if (nextModalIndex !== -1 && nextModalIndex < endReturnIndex) {
      endIndex = nextModalIndex;
    } else if (endReturnIndex !== -1) {
      endIndex = endReturnIndex;
    }
    
    let chunk = newCode.substring(startIndex, endIndex);
    
    // Revert smoked glass back to light frosted glass
    chunk = chunk.replace(/bg-slate-900\/80/g, 'bg-white/30');
    // For original white/5 modals
    chunk = chunk.replace(/bg-white\/5/g, 'bg-white/30');
    
    // Make text dark!
    chunk = chunk.replace(/text-white/g, 'text-slate-900');
    chunk = chunk.replace(/text-slate-400/g, 'text-slate-700');
    chunk = chunk.replace(/text-slate-300/g, 'text-slate-800');
    chunk = chunk.replace(/text-slate-500/g, 'text-slate-600');
    
    // Primary/Accent colors can remain or get slightly darker
    chunk = chunk.replace(/text-indigo-400/g, 'text-indigo-700');
    chunk = chunk.replace(/text-emerald-400/g, 'text-emerald-700');
    chunk = chunk.replace(/text-amber-400/g, 'text-amber-700');
    chunk = chunk.replace(/text-red-400/g, 'text-red-700');
    
    // Input backgrounds: they were bg-black/40 or bg-black/20, make them white/50 so dark text is visible
    chunk = chunk.replace(/bg-black\/40/g, 'bg-white/60');
    chunk = chunk.replace(/bg-black\/20/g, 'bg-white/50');
    
    // Some borders
    chunk = chunk.replace(/border-white\/10/g, 'border-slate-900/10');
    chunk = chunk.replace(/border-white\/20/g, 'border-slate-900/20');
    
    // Box backgrounds
    chunk = chunk.replace(/bg-emerald-500\/10/g, 'bg-emerald-500/20');
    chunk = chunk.replace(/bg-indigo-500\/10/g, 'bg-indigo-500/20');
    chunk = chunk.replace(/bg-indigo-500\/20/g, 'bg-indigo-500/30');
    
    // Preview Box
    chunk = chunk.replace(/bg-slate-800/g, 'bg-slate-100');
    
    // Fix buttons that were text-white and got converted to text-slate-900
    chunk = chunk.replace(/bg-indigo-600 hover:bg-indigo-500 text-slate-900/g, 'bg-indigo-600 hover:bg-indigo-500 text-white');
    chunk = chunk.replace(/bg-indigo-500 hover:bg-indigo-400 text-slate-900/g, 'bg-indigo-600 hover:bg-indigo-500 text-white');
    chunk = chunk.replace(/bg-indigo-600\/90 backdrop-blur-md border border-indigo-400\/30 hover:bg-indigo-500 text-slate-900/g, 'bg-indigo-600/90 backdrop-blur-md border border-indigo-400/30 hover:bg-indigo-500 text-white');
    chunk = chunk.replace(/bg-slate-900\/80 backdrop-blur-md border border-slate-900\/10 hover:bg-slate-800 text-slate-900/g, 'bg-slate-900/80 backdrop-blur-md border border-slate-900/10 hover:bg-slate-800 text-white');
    chunk = chunk.replace(/bg-indigo-600 hover:bg-indigo-500 text-slate-900/g, 'bg-indigo-600 hover:bg-indigo-500 text-white');
    chunk = chunk.replace(/text-slate-900 px-4/g, 'text-white px-4'); // For standard buttons
    
    newCode = newCode.substring(0, startIndex) + chunk + newCode.substring(endIndex);
  }
  
  return newCode;
}

const updatedCode = replaceInModals(code);
fs.writeFileSync('src/app/dashboard/page.tsx', updatedCode);
console.log('Updated page.tsx with light glassy modals and dark text.');
