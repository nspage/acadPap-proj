const fetch = require('node-fetch');

async function test() {
  // Find a work with XML content
  const res = await fetch('https://api.openalex.org/works?filter=has_content.grobid_xml:true&per_page=1');
  const data = await res.json();
  if (data.results.length === 0) {
    console.log("No works found");
    return;
  }
  const work = data.results[0];
  const workId = work.id.split('/').pop();
  console.log("Found work:", workId);
  console.log("has_content:", work.has_content);

  // Fetch the XML
  const xmlRes = await fetch(`https://content.openalex.org/works/${workId}.grobid-xml?api_key=ScDyE5FFaburyQ6XWmb7dY`);
  console.log("XML Fetch status:", xmlRes.status);
  if (xmlRes.ok) {
    const xml = await xmlRes.text();
    console.log("XML length:", xml.length);
    console.log("XML start:", xml.substring(0, 150));
  } else {
    console.log("XML fetch failed:", await xmlRes.text());
  }
}
test();
