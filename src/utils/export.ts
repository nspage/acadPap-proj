import { db } from '../lib/db';

export async function exportAllNotesAsMarkdown(): Promise<void> {
  const papers = await db.savedPapers.toArray();
  const notes = await db.notes.toArray();
  const notesMap = new Map(notes.map(n => [n.paperId, n]));

  let markdown = `# Academic Serendipity - Learning Journal\nExported: ${new Date().toLocaleDateString()}\n\n---\n\n`;

  for (const paper of papers) {
    const note = notesMap.get(paper.id);
    markdown += `## ${paper.title}\n`;
    markdown += `- **Source:** ${paper.source} ([Link](${paper.url}))\n`;
    markdown += `- **Authors:** ${paper.authors.join(', ')}\n`;
    markdown += `- **Saved Date:** ${paper.publishedDate}\n\n`;

    if (note) {
      if (note.takeaways) {
        markdown += `### Core Takeaways\n${note.takeaways}\n\n`;
      }
      if (note.jargonTerms?.length) {
        markdown += `### Jargon & Vocabulary\n`;
        note.jargonTerms.forEach(j => {
          markdown += `- **${j.term}**: ${j.explanation}\n`;
        });
        markdown += `\n`;
      }
      if (note.quotes?.length) {
        markdown += `### Captured Quotes\n`;
        note.quotes.forEach(q => {
          markdown += `> ${q.text}\n\n`;
        });
      }
      if (note.synthesis) {
        markdown += `### Personal Synthesis\n${note.synthesis}\n\n`;
      }
    }
    markdown += `---\n\n`;
  }

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `academic-notes-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
