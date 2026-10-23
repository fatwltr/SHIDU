/* Apply the saved appearance before first paint. No account data is stored. */
(()=>{try{const p=localStorage.getItem('shidu-theme')||'day';const theme=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'night':'day'):p;document.documentElement.dataset.theme=['day','night','paper','forest'].includes(theme)?theme:'day';}catch{document.documentElement.dataset.theme='day';}})();
