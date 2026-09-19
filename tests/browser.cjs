const assert=require('node:assert/strict');

module.exports=async function({call,evaluate,go,origin,errors}) {
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);};
  const open=async file=>{await go(file);await wait('!!document.querySelector(".app-shell")');};
  const click=async selector=>{await wait('!!document.querySelector('+JSON.stringify(selector)+')');await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');};
  const dialog=async action=>{await wait('!!document.querySelector("[role=alertdialog]")');await click('[data-slot="alert-dialog-'+action+'"]');await wait('!document.querySelector("[role=alertdialog]")');};
  const question=`(()=>{const [src,n]=document.querySelector('[data-question-id]').dataset.questionId.split('#');return TOGAF_BANKS.find(b=>b.src===src).questions.find(q=>q.n===Number(n))})()`;
  const choose=async expression=>{const key=await evaluate('(()=>{const q='+question+';return '+expression+'})()');await click('button[data-key="'+key+'"]');};
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await open('?lang=en');
  await click('#custom-only');
  await wait('document.body.textContent.includes("No custom question sets yet")');
  await open('practice/');
  assert.equal(await evaluate('document.querySelector("#build-btn").disabled'),true,'empty custom pool must not fall back to generated questions');
  await click('#custom-only');
  await open('');
  await evaluate("localStorage.setItem('togaf.generated.language','zz')");
  await open('');
  assert.equal(await evaluate('document.documentElement.lang'),'en','unsupported saved language does not change English UI');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark','first visit follows system');
  assert.ok(await evaluate('!!document.querySelector("a[href*=TOGAF-CHEAT-SHEET-EN]")'));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await wait('document.documentElement.dataset.theme==="light"');
  await click('#theme-toggle');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
  await open('practice/?lang=en');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark','explicit choice survives navigation');
  assert.equal(await evaluate('document.getElementById("theme-toggle").getAttribute("aria-label")'),'Switch to light mode');
  await evaluate(`window.realThemeSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Storage blocked')}`);
  await click('#theme-toggle');
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'light','toggle works without storage');
  await evaluate('Storage.prototype.setItem=realThemeSetItem');
  await click('#theme-toggle');
  await call('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'),'light','printing ignores dark preference');
  await call('Emulation.setEmulatedMedia',{media:'',features:[{name:'prefers-color-scheme',value:'light'}]});
  // Exercise all existing quiz and dialog checks in dark mode.
  await open('?lang=en');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".topnav a")].map(a=>[new URL(a.href).pathname,a.textContent.trim()])'),[
    [new URL(origin+'/').pathname,'Overview'],[new URL(origin+'/practice/').pathname,'Practice'],
    [new URL(origin+'/my-data/').pathname,'My data & backups']
  ],'navigation labels match the canonical routes');
  for(const [legacy,target] of [['weak-spots.html','my-data/'],['drill.html','practice/'],['practice.html','']]) {
    await call('Page.navigate',{url:origin+'/'+legacy+'?lang=zz&part=2#backup'});
    await wait('location.href==='+JSON.stringify(origin+'/'+target+'?lang=zz&part=2#backup')+' && !!document.querySelector(".app-shell")');
    assert.equal(await evaluate('document.documentElement.lang'),'en','legacy language bookmarks load English');
  }
  await open('my-data/?lang=en#backup');
  assert.equal(await evaluate('document.querySelector("main h1").textContent'),'My data & backups');
  assert.ok(await evaluate('!!document.getElementById("backup")'));
  await open('practice/?lang=en');
  for(const url of await evaluate('[...document.links].filter(a=>a.origin===location.origin).map(a=>a.href)')) assert.equal((await fetch(url)).status,200,url);
  await open('?lang=en');
  assert.equal(await evaluate('document.querySelectorAll(".practice-card").length'),2);
  // Existing v1 records must survive migration without rewriting unrelated local storage.
  await evaluate(`localStorage.setItem('togaf.runs','private app sentinel');localStorage.setItem(TogafStats.KEY,JSON.stringify([{ts:1,title:'Existing Pages result',part:1,score:1,max:1,items:[{id:'p1-set-01#1',topic:'EA Concepts',earned:1,max:1,sel:'B'}]}]))`);
  await open('my-data/?lang=en');
  assert.ok(await evaluate('document.body.textContent.includes("Existing Pages result")'));
  await click('#download-btn');
  await open('practice/?part=1&lang=en');
  await click('#t-none');assert.equal(await evaluate('document.getElementById("build-btn").disabled'),true);
  await click('#t-all');assert.equal(await evaluate('document.getElementById("build-btn").disabled'),false);
  await evaluate(`const input=document.getElementById('topic-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'zzzznomatch');input.dispatchEvent(new Event('input',{bubbles:true}))`);
  await wait('document.querySelectorAll(".topic-row").length===0');
  await open('practice/?part=1&count=2&auto=1&lang=en');
  await click('#start-btn');await wait('!!document.querySelector("[data-question-id]")');
  await choose('q.o.find(([key])=>key!==q.a)[0]');
  await wait('!!document.querySelector(".rationale")');
  assert.ok(await evaluate('[...document.querySelectorAll(".answer-option")].every(b=>b.disabled)'),'study responses lock after feedback');
  await click('#submit-btn');await dialog('cancel');
  assert.equal(await evaluate('TogafStats.load().length'),1);
  await click('#submit-btn');await dialog('action');await wait('!!document.getElementById("result")');
  assert.equal(await evaluate('TogafStats.load().length'),2);
  assert.equal(await evaluate('TogafStats.load().at(-1).score'),0);
  assert.equal(await evaluate('TogafStats.load().at(-1).items.filter(i=>i.sel===null).length'),1);
  assert.equal(await evaluate('TogafStats.topics(1,[TogafStats.load().at(-1)]).reduce((n,t)=>n+t.seen,0)'),1,'blanks excluded from topic evidence');
  await click('#review-btn');assert.equal(await evaluate('document.querySelectorAll(".answer-review .question-card").length'),2);
  await open('practice/?part=2&count=2&mode=exam&auto=1&lang=zz');
  await click('#start-btn');await wait('!!document.querySelector("[data-question-id]")');
  await choose('Object.keys(q.pts).find(k=>q.pts[k]===3)');
  assert.equal(await evaluate('!!document.querySelector(".rationale")'),false,'exam mode hides rationale');
  await click('#next-btn');await choose('Object.keys(q.pts).find(k=>q.pts[k]===5)');
  // Failed save must leave a recoverable result and a retry must append exactly once.
  await evaluate(`window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===TogafStats.KEY)throw Error('Storage full');return realSetItem.call(this,key,value)}`);
  await click('#submit-btn');await wait('!!document.getElementById("result")');
  assert.equal(await evaluate('TogafStats.load().length'),2);
  assert.ok(await evaluate('document.body.textContent.includes("Storage full")'));
  await evaluate('Storage.prototype.setItem=realSetItem');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Retry saving')).click()`);
  await wait('TogafStats.load().length===3');
  assert.equal(await evaluate('TogafStats.load().at(-1).score'),8);
  assert.equal(await evaluate('TogafStats.importRuns([TogafStats.load().at(-1)])'),0);
  await open('practice/?part=1&count=2&auto=1&lang=en');await click('#start-btn');
  await click('.topnav a');await dialog('cancel');
  assert.ok(await evaluate('!!document.querySelector("[data-question-id]")'));
  await click('.topnav a');await dialog('action');await wait('!!document.querySelector(".practice-card")');
  assert.equal(await evaluate('TogafStats.load().length'),3);
  await open('my-data/?lang=zz');
  await evaluate('window.backupBlob=null;const create=URL.createObjectURL;URL.createObjectURL=blob=>{window.backupBlob=blob;return create(blob)}');
  await click('#download-btn');const backup=await evaluate('backupBlob.text()');assert.equal(JSON.parse(backup).length,3);
  await click('#clear-btn');await dialog('cancel');assert.equal(await evaluate('TogafStats.load().length'),3);
  await click('#clear-btn');await dialog('action');await wait('TogafStats.load().length===0');
  await evaluate(`const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(backup)}],'backup.json',{type:'application/json'}));const file=document.getElementById('backup-file');file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}))`);
  await wait('TogafStats.load().length===3');
  await click('.advanced summary');
  await evaluate(`const input=document.getElementById('io');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'{bad');input.dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('#import-btn');assert.equal(await evaluate('TogafStats.load().length'),3);
  assert.ok(await evaluate('document.body.textContent.includes("Invalid JSON backup")'));
  assert.equal(await evaluate('localStorage.getItem("togaf.runs")'),'private app sentinel');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const lang of ['en','zz']) {
    for(const file of ['','practice/','my-data/']) {
      await open(file+'?lang='+lang);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),file+' '+lang+' mobile layout');
      assert.equal(await evaluate('!!document.querySelector("#language, #translation-notice")'),false);
      assert.equal(await evaluate('document.documentElement.lang'),'en');
      if(file==='') {
        const link=await evaluate('document.querySelector("a[href*=TOGAF-CHEAT-SHEET-]").href');
        assert.ok(link.includes('TOGAF-CHEAT-SHEET-EN.pdf'));
        const response=await fetch(link);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
      }
    }
  }
  await open('practice/?part=2&count=2&auto=1&lang=zz');await click('#start-btn');await wait('!!document.querySelector("[data-question-id]")');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Scenario on phone with legacy language parameter');
  await choose('Object.keys(q.pts).find(k=>q.pts[k]===5)');await click('#submit-btn');await dialog('action');
  await open('?lang=en');
  for(const url of await evaluate('[...document.links].filter(a=>a.origin===location.origin).map(a=>a.href)')) assert.equal((await fetch(url)).status,200,url);
  await open('my-data/?lang=en');
  assert.equal(await evaluate('!!document.querySelector("#github-signin, #github-backup")'),false);
  const custom={version:1,banks:[{id:'browser-check',title:'Custom browser check',part:1,questions:[{n:1,topic:'Custom topic',q:'Select the fifth choice <b>as plain text</b>.',o:['A','B','C','D','E'].map(k=>[k,k]),a:'E',e:'The fifth choice is correct.',images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=']}]}]};
  const importSet=async()=>evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(custom))}],'custom.json',{type:'application/json'}));const input=document.getElementById('dataset-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await importSet();await wait('document.body.textContent.includes("1 new question sets imported")');
  await importSet();await wait('document.body.textContent.includes("0 new question sets imported")');
  await open('practice/?part=1&dataset=custom-browser-check&count=0&auto=1');await click('#start-btn');
  await wait('!!document.querySelector("[data-question-id]")');
  assert.equal(await evaluate('document.querySelectorAll(".answer-option").length'),5);
  assert.equal(await evaluate('document.querySelector(".question-text b")'),null,'imported HTML stays text');
  await wait('document.querySelector(".question-card img").complete');
  assert.ok(await evaluate('document.querySelector(".question-card img").naturalWidth>0'));
  await click('button[data-key="E"]');await click('#submit-btn');await wait('!!document.getElementById("result")');
  assert.equal(await evaluate('TogafStats.load().at(-1).score'),1);
  assert.equal(await evaluate('TogafStats.load().at(-1).items[0].id'),'custom-browser-check#1');
  await open('my-data/');assert.equal(await evaluate('TogafStats.load().at(-1).score'),1);
  assert.equal(await evaluate('TogafStats.importRuns([TogafStats.load().at(-1)])'),0);
  await click('#dataset-export');
  await require('./custom-filter.cjs')({evaluate,open,click,wait});
  await evaluate('localStorage.setItem(TogafStats.KEY,"{broken")');await open('my-data/?lang=en');
  assert.ok(await evaluate('document.body.textContent.includes("Results unavailable:")'));
  assert.equal(await evaluate('localStorage.getItem(TogafStats.KEY)'),'{broken');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: React/shadcn routes, existing v1 progress, scoring, blanks, retry/deduplication, dialogs, navigation guard, JSON backup/restore, malformed storage, mobile layouts and themes.');
};



