/* Loads a data file (walks, sounds) fresh on every visit, bypassing the 10-minute cache of GitHub Pages.
   Usage: <script src="../assets/js/fresh-data.js" data-src="../data/walks.js"></script> */
(function () {
  var s = document.currentScript, src = s && s.getAttribute('data-src');
  if (src) document.write('<script src="' + src + '?v=' + Date.now() + '"><\/script>');
})();
