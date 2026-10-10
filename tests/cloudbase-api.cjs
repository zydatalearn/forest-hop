const assert = require('node:assert/strict');
const { createServer } = require('../cloudfunctions/forest-hop-api');
const env = { TCB_ENV: 'test-env', CLOUDBASE_APIKEY: 'test-secret', ALLOWED_ORIGIN: 'https://zydatalearn.github.io' };
const best = new Map();
let calls = 0;
const server = createServer(env, async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert(url.startsWith('https://test-env.api.tcloudbasegateway.com/v1/rdb/rest/'));
    if (url.endsWith('rpc/forest_hop_ranking')) {
        const {player_name} = JSON.parse(options.body);
        const all = [...best].map(([name,score])=>({name,score})).sort((a,b)=>b.score-a.score)
            .map((row,index)=>({...row,rank:index+1}));
        return new Response(JSON.stringify({records:all.slice(0,10),self:all.find(row=>row.name===player_name)||null}));
    }
    if (options.method === 'POST') {
        assert(url.endsWith('rpc/forest_hop_submit'));
        const { player_name: name, run_score: score } = JSON.parse(options.body);
        best.set(name, Math.max(best.get(name) || 0, score));
        return new Response(JSON.stringify([{ name, score: best.get(name) }]));
    }
    return new Response(JSON.stringify([...best].map(([name, score])=>({name,score}))));
});
(async () => {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    const headers = { Origin: env.ALLOWED_ORIGIN, 'Content-Type':'application/json' };
    const post = body=>fetch(url+'/scores',{method:'POST',headers,body:JSON.stringify(body)});
    let response = await fetch(url+'/scores',{method:'OPTIONS',headers});
    assert.equal(response.status,204);
    assert.equal(response.headers.get('access-control-allow-origin'),env.ALLOWED_ORIGIN);
    response = await post({name:'小树',score:310});
    assert.equal(response.status,200);assert(!(await response.text()).includes(env.CLOUDBASE_APIKEY));
    response = await post({name:'小树',score:80});
    assert.equal((await response.json()).record.score,310);
    response = await fetch(url+'/scores?name='+encodeURIComponent('小树'),{headers});
    assert.deepEqual(await response.json(),{records:[{name:'小树',score:310,rank:1}],self:{name:'小树',score:310,rank:1}});
    for(const body of [{name:'',score:1},{name:'小树',score:-1},{name:'小树',score:1.5},{name:'小树',score:2147483648}])assert.equal((await post(body)).status,400);
    assert.equal((await fetch(url+'/scores',{headers:{Origin:'https://other.example'}})).status,403);
    assert.equal(calls,3);
    for(let i=0;i<3;i++)assert.equal((await post({name:'小树',score:310})).status,200);
    assert.equal((await post({name:'小树',score:310})).status,429);
    console.log('Passed: PG API contract, highest score response, CORS, invalid submissions, throttling and secret isolation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
