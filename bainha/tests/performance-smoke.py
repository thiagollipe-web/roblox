"""Comparable WebGL workload, measured in software Chromium (not device FPS).

No app state mutations. Native GL wrappers count submitted work, including shadows.
The timed rAF callback includes simulation + DOM + animation + renderer submission;
it is not a GPU duration and is not presented as renderer-only CPU duration.
"""
import argparse
import asyncio
import hashlib
import json
import math
import platform
import statistics
import subprocess
import time
from pathlib import Path
from playwright.async_api import async_playwright

FLAGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
INSTRUMENT = r'''(() => {
  const tally = {drawCalls:0, triangles:0};
  const samples = [];
  let phase = 'warmup', previousStart = null;
  const triangles = (mode,count) => mode===4 ? Math.floor(count/3) : (mode===5||mode===6 ? Math.max(0,count-2) : 0);
  for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Type) continue;
    for (const [name,countIndex,instancesIndex] of [
      ['drawArrays',2,-1], ['drawElements',1,-1],
      ['drawArraysInstanced',2,3], ['drawElementsInstanced',1,4],
    ]) {
      // Only replace methods this prototype owns; avoid double wrapping inherited calls.
      if (!Object.prototype.hasOwnProperty.call(Type.prototype,name)) continue;
      const original = Type.prototype[name];
      Type.prototype[name] = function(...args) {
        tally.drawCalls++;
        tally.triangles += triangles(args[0],args[countIndex])*(instancesIndex<0?1:args[instancesIndex]);
        return Reflect.apply(original,this,args);
      };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(timestamp => {
    const start=performance.now(), calls=tally.drawCalls, tris=tally.triangles;
    const result=callback(timestamp);
    const duration=performance.now()-start, drawCalls=tally.drawCalls-calls;
    if (drawCalls>0) {
      samples.push({phase,start,interval:previousStart===null?null:start-previousStart,
        callbackMs:duration,drawCalls,triangles:tally.triangles-tris});
      previousStart=start;
    }
    return result;
  });
  window.__PERFORMANCE_QA__ = {
    phase: name => {phase=name;},
    count: name => samples.filter(s=>s.phase===name).length,
    result: () => samples,
  };
})();'''

def percentile(values, p):
    a=sorted(values)
    at=(len(a)-1)*p
    lo=math.floor(at); hi=math.ceil(at)
    return round(a[lo]+(a[hi]-a[lo])*(at-lo),3)

def stats(values):
    return {'mean':round(statistics.mean(values),3),'median':percentile(values,.5),
            'p95':percentile(values,.95),'max':round(max(values),3)}

def summaries(samples):
    output={}
    for phase in ('idle','moving'):
        rows=[s for s in samples if s['phase']==phase]
        output[phase]={'frames':len(rows)}
        for source,dest in [('interval','frame_interval_ms'),('callbackMs','app_raf_callback_ms'),
                            ('drawCalls','draw_calls_per_frame'),('triangles','triangles_per_frame')]:
            output[phase][dest]=stats([s[source] for s in rows if s[source] is not None])
    return output

async def snapshot(page):
    return await page.evaluate('window.__BAINHA__.snapshot()')

async def wait_state(page, expression):
    await page.wait_for_function('() => { const s=window.__BAINHA__.snapshot(); return '+expression+'; }',polling=75,timeout=30000)

async def collect(page, phase, frames):
    await page.evaluate('(phase)=>window.__PERFORMANCE_QA__.phase(phase)',phase)
    await page.wait_for_function('([phase,n])=>window.__PERFORMANCE_QA__.count(phase)>=n',arg=[phase,frames],polling=100,timeout=60000)

async def profile(browser, name, url, output, quality):
    mobile=name=='portrait'
    viewport={'width':390,'height':844} if mobile else {'width':1280,'height':720}
    context=await browser.new_context(viewport=viewport,device_scale_factor=1,has_touch=mobile,is_mobile=mobile)
    await context.add_init_script(INSTRUMENT)
    page=await context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
    begin=time.monotonic()
    await page.goto(url,wait_until='networkidle')
    await page.wait_for_function('window.__BAINHA__ && !document.querySelector("#menu").hidden')
    await page.locator('#start').click()
    await wait_state(page,'s.started && !s.paused && s.grounded')
    if quality:
        await page.locator('#pause').click()
        await page.locator('#graphics-quality').select_option(quality)
        await page.locator('#resume').click()
        await wait_state(page,'s.started && !s.paused && s.grounded')
    await page.wait_for_function('window.__PERFORMANCE_QA__.count("warmup")>=35',polling=100,timeout=60000)
    await collect(page,'idle',90)
    await page.evaluate('window.__PERFORMANCE_QA__.phase("capture")')
    await page.screenshot(path=str(output/(name+'-idle.png')))
    initial=await snapshot(page)
    await page.evaluate('window.__PERFORMANCE_QA__.phase("moving")')
    endpoints=[]
    if mobile:
        cdp=await context.new_cdp_session(page)
        zone=await page.locator('#touch-zone').bounding_box()
        x=zone['x']+zone['width']/2; y=zone['y']+zone['height']/2
        async def touch(kind,dx=0):
            points=[] if kind=='touchEnd' else [{'x':x+dx,'y':y,'id':1,'radiusX':4,'radiusY':4,'force':1}]
            await cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
        start=asyncio.create_task(touch('touchStart'))
        await asyncio.sleep(.016)
        # The side camera looks from -X: screen-right moves toward world +Z.
        # Keep this back-and-forth route within the start platform (Z -5 to +5).
        move=asyncio.create_task(touch('touchMove',42))
        await asyncio.gather(start,move)
        assert not (await snapshot(page))['aiming'],'Touch driver accidentally long-pressed'
        for i,target in enumerate([2,-2,2,-2,0]):
            if i: await touch('touchMove',42 if target>=0 else -42)
            await wait_state(page,f's.position.z {">=" if target>=0 else "<="} {target}')
            endpoints.append(await snapshot(page))
        await touch('touchEnd')
    else:
        for target in [2,-2,2,-2,0]:
            key='d' if target>=0 else 'a'
            await page.keyboard.down(key)
            await wait_state(page,f's.position.z {">=" if target>=0 else "<="} {target}')
            await page.keyboard.up(key)
            endpoints.append(await snapshot(page))
    await page.evaluate('window.__PERFORMANCE_QA__.phase("capture")')
    await page.screenshot(path=str(output/(name+'-moving.png')))
    ending=await snapshot(page)
    assert ending['deaths']==initial['deaths'] and not ending['paused'],'Workload must stay on first platform'
    details=await page.evaluate('''() => {
      const canvas=document.querySelector('#scene canvas');
      const gl=canvas.getContext('webgl2');
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      return {canvas:{width:canvas.width,height:canvas.height},devicePixelRatio,
        userAgent:navigator.userAgent,glVersion:gl.getParameter(gl.VERSION),
        glRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        samples:window.__PERFORMANCE_QA__.result()};
    }''')
    result={'viewport':viewport,'dpr':1,'touch':mobile,'duration_seconds':round(time.monotonic()-begin,2),
            'errors':errors,'initial_state':initial,'end_state':ending,'movement_endpoints':endpoints,
            'summary':summaries(details['samples']),**details}
    (output/(name+'-raw.json')).write_text(json.dumps(result,indent=2))
    print(name,json.dumps(result['summary']),flush=True)
    await context.close()
    return {k:v for k,v in result.items() if k!='samples'}

async def main(args):
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    build=Path(args.build_dir)
    manifest={str(p.relative_to(build)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(build.rglob('*')) if p.is_file()}
    report={'label':args.label,'url':args.url,'quality_selection':args.quality,'build_sha256':manifest,
            'chromium':subprocess.check_output(['/usr/bin/chromium','--version'],text=True).strip(),
            'host':platform.platform(),'flags':FLAGS,'instrumentation':'Native WebGL draws + rAF callback timing; no app state mutations',
            'limitations':['SwiftShader software rendering is not representative of user hardware FPS.',
                'rAF callback CPU covers the entire app loop including simulation, DOM, animations, draw submission and GL wrapper overhead.',
                'Draw/triangle counts include shadow passes and may include offscreen work. No GPU duration or renderer-only CPU measured.',
                'Workload samples start-platform idle and side-view movement along world Z; it does not prove late-level performance or diagnose a specific user device.'],
            'profiles':{}}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=FLAGS)
        for name in ('desktop','portrait'):
            report['profiles'][name]=await profile(browser,name,args.url,output,args.quality)
            (output/'report.json').write_text(json.dumps(report,indent=2))
        await browser.close()
    if args.compare:
        baseline=json.loads(Path(args.compare).read_text())
        comparison={'baseline':str(args.compare),'candidate':str(output/'report.json'),'profiles':{}}
        for name,current in report['profiles'].items():
            previous=baseline['profiles'][name]
            assert current['viewport']==previous['viewport'] and current['dpr']==previous['dpr'], 'Viewport or DPR changed'
            assert current['canvas']==previous['canvas'], 'Drawing buffer resolution changed; cannot claim equal-resolution comparison'
            deltas={}
            for phase in ('idle','moving'):
                deltas[phase]={}
                for metric in ('draw_calls_per_frame','triangles_per_frame','frame_interval_ms','app_raf_callback_ms'):
                    a=previous['summary'][phase][metric];b=current['summary'][phase][metric]
                    deltas[phase][metric]={stat:{'baseline':a[stat],'candidate':b[stat],
                        'change_percent':round((b[stat]/a[stat]-1)*100,2)} for stat in ('median','p95')}
            comparison['profiles'][name]=deltas
        (output/'comparison.json').write_text(json.dumps(comparison,indent=2))
        print('Comparison',json.dumps(comparison['profiles']),flush=True)
    print('Saved',output/'report.json',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label',required=True)
    parser.add_argument('--quality',choices=['auto','high','low'])
    parser.add_argument('--compare',help='Optional baseline report.json; validates equal drawing buffer resolution')
    parser.add_argument('--url',required=True)
    parser.add_argument('--build-dir',required=True)
    parser.add_argument('--output',required=True)
    asyncio.run(main(parser.parse_args()))
