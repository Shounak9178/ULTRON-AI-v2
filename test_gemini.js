const https = require('https');
const config = require('./config');

function callGemini(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const key=config.GEMINI_API_KEY, model=config.GEMINI_MODEL||'gemini-2.0-flash';
    if(!key||key==='YOUR_GEMINI_API_KEY_HERE') return reject(new Error('NO_GEMINI_KEY'));
    const body=JSON.stringify({
      contents:[{parts:[{text:systemPrompt+'\n\n'+userMessage}]}],
      generationConfig:{maxOutputTokens:config.MAX_TOKENS||8192,temperature:0.1},
    });
    const req=https.request({
      hostname:'generativelanguage.googleapis.com',
      path:`/v1beta/models/${model}:generateContent?key=${key}`,
      method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
    },res=>{
      let data=''; res.on('data',c=>{data+=c;});
      res.on('end',()=>{
        console.log("RESPONSE:", data.slice(0, 500));
        try{
          const p=JSON.parse(data);
          if(p.error) return reject(new Error(`Gemini: ${p.error.message}`));
          const text=p?.candidates?.[0]?.content?.parts?.[0]?.text;
          if(!text) return reject(new Error('Empty Gemini response'));
          resolve(text);
        }catch(e){reject(new Error(`Gemini parse: ${e.message}`));}
      });
    });
    req.on('error',e=>reject(new Error(`Network: ${e.message}`)));
    req.write(body); req.end();
  });
}

callGemini("System", "Hello").catch(console.error);
