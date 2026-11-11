/* WALK: the chain of walks.
   Each walk is recorded by a different person. They play in random order, each once before any repeats,
   with a crossfade. Upload the MP3 into audio/walks/ and add a block like this (remove the // marks):

   // { "file": "audio/walks/walk-01.mp3", "author": "Name Surname", "place": "Florence, Rifredi",
   //   "date": "2026-11-20", "description": "What can be heard, in words: who, where, what happens." },

   While the list is empty, the page says the first walks are on their way. */
window.WILDCARE_WALKS = [
{ "file": "audio/walks/walk-01-genoa.mp3", "author": "[recorded by]", "place": "Genoa",
  "date": "[YYYY-MM-DD]", "description": "[What can be heard, in words: who, where, what happens.]" },
{ "file": "audio/walks/walk-02-venice.mp3", "author": "[recorded by]", "place": "Venice",
  "date": "[YYYY-MM-DD]", "description": "[What can be heard, in words: who, where, what happens.]" },
{ "file": "audio/walks/walk-03-helsinki.mp3", "author": "[recorded by]", "place": "Helsinki",
  "date": "[YYYY-MM-DD]", "description": "[What can be heard, in words: who, where, what happens.]" }
];
