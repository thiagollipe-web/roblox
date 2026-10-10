"""Regression checks for audited input, dialog, loading and recovery defects.

Uses real keyboard/CDP touch, an explicitly emulated Gamepad input provider,
and the native WEBGL_lose_context extension. Application state is read only. Movement follows the 2.5D Z rail.
Requires an HTTP server so native context restoration can reload the game.
"""
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.parse import urljoin
from playwright.async_api import async_playwright

URL=os.environ.get('BAINHA_URL','http://127.0.0.1:8001/prototipo/')
OUT=Path(os.environ.get('BAINHA_ARTIFACTS','/workspace/onboarding/bainha-audit/regression'))
OUT.mkdir(parents=True,exist_ok=True)
report={'url':URL,'input_method':'real keyboard and CDP touch; navigator.getGamepads input-provider stub, not physical controller',
    'checks':[],'errors':[],'failed_http':[],'screenshots':[]}
current_page=None

async def snap(page):
    return await page.evaluate('window.__BAINHA__?.snapshot() ?? null')

async def capture(page,name):
    path=OUT/(name+'.png')
    await page.screenshot(path=str(path))
    report['screenshots'].append(str(path))

async def wait(page,expression,timeout=20000):
    try:
        await page.wait_for_function('()=>{const s=window.__BAINHA__.snapshot();return '+expression+';}',timeout=timeout)
    except Exception:
        report['failed_condition']=expression
        report['failure_state']=await snap(page)
        await capture(page,'failure')
        raise

async def check(name,condition,evidence=None):
    if not condition:
        report['failure_state']=await snap(current_page)
        await capture(current_page,'failure')
        raise AssertionError(name+': '+json.dumps(evidence))
    report['checks'].append({'name':name,'evidence':evidence})
    print(name,flush=True)

def mechanisms(state):
    return {key:state[key] for key in ('pair','taut','pulses','enemy','canalOpen')}

async def observe(page):
    global current_page
    current_page=page
    page.on('pageerror',lambda error:report['errors'].append(str(error)))
    page.on('console',lambda message:report['errors'].append(message.text) if message.type=='error' else None)
    page.on('response',lambda response:report['failed_http'].append({'url':response.url,'status':response.status}) if response.status>=400 else None)
    page.on('requestfailed',lambda request:report['errors'].append(f'{request.url}: {request.failure}'))

async def start_low(page):
    await page.locator('#start').click()
    await wait(page,'s.started && s.grounded')
    await page.locator('#pause').click()
    await page.locator('#graphics-quality').select_option('low')
    await page.locator('#resume').click()
    await wait(page,'!s.paused && s.elapsed>1.5')

async def after_time(page,seconds=.3):
    before=await snap(page)
    await wait(page,f's.elapsed>={before["elapsed"]+seconds}')

async def settle(page):
    await wait(page,'s.grounded && Math.hypot(s.velocity.x,s.velocity.z)<.01')

async def restart(page):
    if not (await snap(page))['paused']:
        await page.locator('#pause').click()
    await page.locator('#restart').click()
    await wait(page,'s.grounded && !s.paused && s.elapsed>.8')

async def jump_to(page,takeoff,landing):
    deaths=(await snap(page))['deaths']
    await page.keyboard.down('d')
    try:
        await wait(page,f's.position.z>={takeoff}')
        await page.keyboard.press('Space')
        await wait(page,f's.position.z>={landing} || s.deaths>{deaths}')
    finally:
        await page.keyboard.up('d')
    await settle(page)
    assert (await snap(page))['deaths']==deaths,'Anchor approach jump failed'

async def reach_anchor(page):
    await jump_to(page,4,7.2)
    await jump_to(page,8.6,11.6)
    await jump_to(page,12.9,16.5)
    await page.keyboard.down('d')
    try:
        await wait(page,'s.position.z>=22')
    finally:
        await page.keyboard.up('d')
    await settle(page)
    await wait(page,'s.checkpoint===1')

async def install_pad(page):
    await page.evaluate('''()=>{
      window.__QA_PAD__={active:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
      Object.defineProperty(navigator,'getGamepads',{value:()=>window.__QA_PAD__.active?[{
        id:'Regression input-provider emulation',index:0,connected:true,mapping:'standard',timestamp:performance.now(),
        axes:window.__QA_PAD__.axes,buttons:window.__QA_PAD__.buttons
      }]:[]});
    }''')

async def pad_buttons(page,values):
    await page.evaluate('(values)=>{for(const [index,pressed] of Object.entries(values))window.__QA_PAD__.buttons[index]={pressed,value:pressed?1:0,touched:pressed};}',{str(key):value for key,value in values.items()})

async def keyboard_and_pad(page):
    base=await snap(page)
    await page.locator('#pause').focus()
    await page.keyboard.press('Space')
    await wait(page,'s.paused')
    state=await snap(page)
    await check('Space activates focused Pause without jumping',abs(state['position']['y']-base['position']['y'])<.02)
    await check('pause focuses Resume and makes background controls inert',await page.evaluate('document.activeElement.id==="resume" && document.querySelector("#hud").inert && document.querySelector("#controls").inert'))
    await page.locator('#graphics-quality').focus()
    await page.keyboard.press('Shift+Tab')
    last=await page.evaluate('document.activeElement.id')
    await page.keyboard.press('Tab')
    first=await page.evaluate('document.activeElement.id')
    for _ in range(6):
        await page.keyboard.press('Tab')
        assert await page.evaluate('!!document.activeElement.closest("#pause-menu")'),'Modal focus escaped'
    await check('Tab and Shift-Tab remain inside pause dialog',last=='restart' and first=='graphics-quality',{'backward_wrap':last,'forward_wrap':first})
    await page.locator('#resume').focus()
    await page.keyboard.press('Space')
    await wait(page,'!s.paused')
    await page.locator('#help').focus()
    await page.keyboard.press('Space')
    await wait(page,'s.paused')
    await check('Space activates focused Help and Resume buttons',await page.evaluate('document.activeElement.id==="resume"'))
    await page.locator('#resume').click()

    await page.keyboard.down('Escape')
    await wait(page,'s.paused')
    await page.keyboard.down('Escape')
    await page.wait_for_timeout(200)
    await check('held Escape repeat cannot immediately unpause',(await snap(page))['paused'])
    await page.keyboard.up('Escape')
    await page.keyboard.press('Escape')
    await wait(page,'!s.paused')
    await page.keyboard.down('d')
    await wait(page,'s.position.z>.4')
    await page.keyboard.press('Escape')
    await page.keyboard.up('d')
    frozen=await snap(page)
    await page.wait_for_timeout(250)
    await check('pause freezes motion with a previously held movement key',(await snap(page))['position']==frozen['position'])
    await page.locator('#resume').click()
    await settle(page)
    stopped=await snap(page)
    await after_time(page)
    await check('released movement key stays cleared after resume',math.hypot((await snap(page))['position']['x']-stopped['position']['x'],(await snap(page))['position']['z']-stopped['position']['z'])<.02)
    await restart(page)
    await reach_anchor(page)
    await capture(page,'desktop-under-one-way-ledge')

    before=mechanisms(await snap(page))
    await page.keyboard.down('e')
    await wait(page,'s.aiming')
    await page.keyboard.press('Escape')
    await wait(page,'!s.aiming')
    await page.keyboard.down('e')
    await page.wait_for_timeout(200)
    repeated=await snap(page)
    await page.keyboard.up('e')
    await after_time(page)
    await check('Escape cancels held E until a genuinely fresh press',not repeated['aiming'] and mechanisms(await snap(page))==before)
    await page.keyboard.press('e')
    await wait(page,'s.pair===0 && !s.taut')
    await check('fresh E still weaves exactly one bridge',True)

    await install_pad(page)
    # A newly connected controller must first be observed with neutral buttons.
    await after_time(page,.15)
    before=mechanisms(await snap(page))
    await pad_buttons(page,{7:True})
    await wait(page,'s.aiming')
    await page.keyboard.press('Escape')
    await wait(page,'!s.aiming')
    await pad_buttons(page,{7:False})
    await after_time(page)
    await check('Escape cancels gamepad RT release without acting',mechanisms(await snap(page))==before)
    await pad_buttons(page,{7:True})
    await wait(page,'s.aiming')
    await pad_buttons(page,{7:False})
    await wait(page,'s.taut')
    await check('fresh RT release still performs one action',True)

    await page.locator('#pause').click()
    before=await snap(page)
    await pad_buttons(page,{0:True,7:True})
    await page.wait_for_timeout(300)
    await page.locator('#resume').click()
    await after_time(page)
    held=await snap(page)
    await check('A and RT held through pause do not trigger on resume',held['grounded'] and not held['aiming'] and abs(held['position']['y']-before['position']['y'])<.02 and mechanisms(held)==mechanisms(before))
    await pad_buttons(page,{0:False,7:False})
    await after_time(page)
    await check('release of cancelled held RT does not change mechanism',mechanisms(await snap(page))==mechanisms(before))
    await pad_buttons(page,{0:True})
    await wait(page,'!s.grounded && s.velocity.y>0')
    await pad_buttons(page,{0:False})
    await capture(page,'desktop-jump-under-one-way-ledge')
    await settle(page)
    await check('fresh gamepad A still jumps after pause',True)
    before=mechanisms(await snap(page))
    await pad_buttons(page,{7:True})
    await wait(page,'s.aiming')
    await page.evaluate('window.__QA_PAD__.active=false')
    await wait(page,'!s.aiming')
    await pad_buttons(page,{7:False})
    await page.evaluate('window.__QA_PAD__.active=true')
    await after_time(page)
    await check('gamepad disconnect cancels an armed action',mechanisms(await snap(page))==before)

    # Reconnection with a still-held button is not a fresh press. This emulates
    # only the input provider; no game state, physics or renderer values change.
    before=mechanisms(await snap(page))
    await pad_buttons(page,{7:True})
    await wait(page,'s.aiming')
    await page.evaluate('window.__QA_PAD__.active=false')
    await wait(page,'!s.aiming')
    await page.evaluate('window.__QA_PAD__.active=true')
    await after_time(page,.2)
    reconnected=await snap(page)
    await pad_buttons(page,{7:False})
    await after_time(page,.2)
    await check('held RT reconnect and release cannot restore a cancelled action',
        not reconnected['aiming'] and mechanisms(await snap(page))==before)
    await pad_buttons(page,{7:True})
    await wait(page,'s.aiming')
    await pad_buttons(page,{7:False})
    await after_time(page,.2)
    await check('fresh RT press after reconnect still performs one action',
        mechanisms(await snap(page))!=before)

    await pad_buttons(page,{0:True})
    await wait(page,'!s.grounded && s.velocity.y>0')
    await page.evaluate('window.__QA_PAD__.active=false')
    await settle(page)
    before=await snap(page)
    await page.evaluate('window.__QA_PAD__.active=true')
    await after_time(page,.25)
    after=await snap(page)
    await check('held A reconnect after landing cannot trigger another jump',
        after['grounded'] and abs(after['position']['y']-before['position']['y'])<.02)
    await pad_buttons(page,{0:False})
    await after_time(page,.15)
    await pad_buttons(page,{0:True})
    await wait(page,'!s.grounded && s.velocity.y>0')
    await pad_buttons(page,{0:False})
    await settle(page)
    await check('fresh A press after reconnect still jumps',True)

    await pad_buttons(page,{9:True})
    await wait(page,'s.paused')
    await page.evaluate('window.__QA_PAD__.active=false')
    await page.wait_for_timeout(200)
    await page.evaluate('window.__QA_PAD__.active=true')
    await page.wait_for_timeout(300)
    await check('held Start reconnect cannot unpause the game',(await snap(page))['paused'])
    await pad_buttons(page,{9:False})
    await page.wait_for_timeout(150)
    await pad_buttons(page,{9:True})
    await wait(page,'!s.paused')
    await pad_buttons(page,{9:False})
    await check('fresh Start press after reconnect still resumes',True)
    await capture(page,'desktop-input-recovered')

async def context_recovery(page):
    supported=await page.evaluate('''()=>{window.__QA_LOSS__=document.querySelector('#scene canvas').getContext('webgl2').getExtension('WEBGL_lose_context');if(!window.__QA_LOSS__)return false;window.__QA_LOSS__.loseContext();return true;}''')
    assert supported,'Native WEBGL_lose_context extension unavailable'
    await page.wait_for_function('!document.querySelector("#error").hidden')
    await wait(page,'s.paused')
    before=await snap(page)
    await page.keyboard.press('Escape')
    await page.keyboard.down('d')
    await page.keyboard.down('e')
    await pad_buttons(page,{0:True,7:True,9:True})
    await page.wait_for_timeout(500)
    await page.keyboard.up('d')
    await page.keyboard.up('e')
    after=await snap(page)
    await check('native GPU-loss error blocks resume, input, physics and drawing',after['paused'] and not after['aiming'] and after['position']==before['position'] and after['elapsed']==before['elapsed'] and after['render']['renderedFrames']==before['render']['renderedFrames'])
    for _ in range(3):
        await page.keyboard.press('Tab')
        assert await page.evaluate('!!document.activeElement.closest("#error")')
    await check('error dialog traps focus on recovery controls',True)
    await capture(page,'native-context-loss-blocked')
    await page.evaluate('window.__QA_LOSS__.restoreContext()')
    await page.wait_for_function('window.__BAINHA__ && !window.__BAINHA__.snapshot().started && !document.querySelector("#menu").hidden',timeout=30000)
    await check('native GPU restoration reloads a usable start menu',await page.evaluate('document.querySelector("#error").hidden && !document.querySelector("#scene canvas").getContext("webgl2").isContextLost()'))
    await capture(page,'native-context-restored')

class Touch:
    def __init__(self,page,cdp):self.page=page;self.cdp=cdp;self.primary=None
    @classmethod
    async def create(cls,page):return cls(page,await page.context.new_cdp_session(page))
    async def send(self,kind,points):await self.cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
    async def steer(self):
        box=await self.page.locator('#touch-zone').bounding_box()
        point={'id':1,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'radiusX':4,'radiusY':4,'force':1}
        self.primary={**point,'x':point['x']+12}
        start=asyncio.create_task(self.send('touchStart',[point]))
        await asyncio.sleep(.016)
        move=asyncio.create_task(self.send('touchMove',[self.primary]))
        await asyncio.gather(start,move)
        await wait(self.page,'!s.aiming && Math.abs(s.velocity.z)>1')
    async def button(self,selector,drag_off=False):
        box=await self.page.locator(selector).bounding_box()
        second={'id':2,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'radiusX':4,'radiusY':4,'force':1}
        await self.send('touchStart',[self.primary,second])
        pressed=await snap(self.page)
        if drag_off:
            second={**second,'x':second['x']-110,'y':second['y']-100}
            await self.send('touchMove',[self.primary,second])
        # CDP touchEnd points identify the finger ENDING, not remaining fingers.
        await self.send('touchEnd',[second])
        return pressed
    async def end(self,cancel=False):
        await self.send('touchCancel' if cancel else 'touchEnd',[])
        self.primary=None

async def mobile_cases(page):
    for width,height in [(480,320),(568,320),(320,568),(844,390),(390,844)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.wait_for_timeout(120)
        geometry=await page.locator('#start').evaluate('(el)=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};}')
        await check(f'start button fits viewport {width}x{height}',geometry['x']>=0 and geometry['y']>=0 and geometry['right']<=width and geometry['bottom']<=height,geometry)
        if width==568:await capture(page,'compact-landscape-start')
    await start_low(page)
    await page.set_viewport_size({'width':480,'height':320})
    await page.wait_for_timeout(100)
    geometry=await page.evaluate('''()=>{
      const r=window.__BAINHA__.snapshot().render,p=r.camera.hero,m=r.camera.viewProjection,points=[];
      for(const y of [0,1.8])for(const z of [-.55,.55]){
        const a=p.x,b=p.y+y,c=p.z+z,w=m[3]*a+m[7]*b+m[11]*c+m[15];
        points.push([(m[0]*a+m[4]*b+m[8]*c+m[12])/w*innerWidth/2+innerWidth/2,innerHeight/2-(m[1]*a+m[5]*b+m[9]*c+m[13])/w*innerHeight/2]);
      }
      const hero={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
      const el=document.querySelector('#toast'),b=el.getBoundingClientRect(),toast={left:b.left,right:b.right,top:b.top,bottom:b.bottom,hidden:el.hidden};
      return {hero,toast,overlap:hero.left<toast.right&&hero.right>toast.left&&hero.top<toast.bottom&&hero.bottom>toast.top};
    }''')
    await check('480x320 message fits and leaves the character unobscured',
        not geometry['toast']['hidden'] and not geometry['overlap']
        and geometry['toast']['left']>=0 and geometry['toast']['right']<=480
        and geometry['toast']['top']>=0 and geometry['toast']['bottom']<=320,geometry)
    await capture(page,'narrow-landscape-message-clear')
    await page.set_viewport_size({'width':390,'height':844})
    touch=await Touch.create(page)
    await touch.steer()
    await touch.button('#jump')
    await wait(page,'s.position.y>.25')
    await touch.end(cancel=True)
    await settle(page)
    await check('secondary-finger Jump works while steering and cancel stops motion',True)
    await restart(page)
    await touch.steer()
    await touch.button('#pause')
    await wait(page,'s.paused')
    await check('secondary-finger Pause activates while joystick remains held',True)
    await touch.end()
    await page.locator('#resume').tap()
    await wait(page,'!s.paused')
    await settle(page)
    stopped=await snap(page)
    await after_time(page)
    await check('Resume does not restore joystick input released during pause',math.hypot((await snap(page))['position']['x']-stopped['position']['x'],(await snap(page))['position']['z']-stopped['position']['z'])<.02)
    await restart(page)
    await reach_anchor(page)
    await touch.steer()
    await touch.button('#action')
    await wait(page,'s.pair===0')
    await touch.end()
    await settle(page)
    await check('secondary-finger action creates exactly one loose bridge',not (await snap(page))['taut'])
    await page.locator('#action').tap()
    await wait(page,'s.taut')
    await check('primary-finger action still fires exactly once',True)
    before=mechanisms(await snap(page))
    await touch.steer()
    pressed=await touch.button('#action',drag_off=True)
    await touch.end(cancel=True)
    await settle(page)
    await check('pointerdown action fires once even if finger subsequently drags outside',
        pressed['pulses']==before['pulses']+1 and not pressed['taut']
        and mechanisms(await snap(page))==mechanisms(pressed))
    await capture(page,'mobile-multitouch-recovered')
    for width,height in [(320,568),(480,320),(568,320),(844,390),(390,844)]:
        await page.set_viewport_size({'width':width,'height':height})
        await page.locator('#pause').tap()
        await wait(page,'s.paused')
        await page.locator('#resume').tap()
        await wait(page,'!s.paused')
        overflow=await page.evaluate('({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight})')
        await check(f'resized pause dialog remains usable at {width}x{height}',overflow=={'x':0,'y':0},overflow)

async def main():
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            desktop=await browser.new_context(viewport={'width':1280,'height':720})
            page=await desktop.new_page()
            await observe(page)
            module_gate=asyncio.Event()
            async def delay_module(route):
                await module_gate.wait()
                await route.continue_()
            await desktop.route('**/assets/*.js',delay_module)
            await page.goto(URL,wait_until='commit')
            await page.locator('#loading').wait_for(state='visible')
            hidden=await page.locator('#menu').is_hidden()
            await page.keyboard.press('Tab')
            await page.keyboard.press('Enter')
            module_gate.set()
            await page.wait_for_function('window.__BAINHA__')
            await desktop.unroute('**/assets/*.js',delay_module)
            await check('slow module loading exposes no interactive start menu',hidden and not (await snap(page))['started'],{'preventative_loading_boundary':True})
            module_url=await page.locator('script[type="module"]').get_attribute('src')
            module_response=await page.request.get(urljoin(URL,module_url))
            report['module']={'url':module_url,'sha256':hashlib.sha256(await module_response.body()).hexdigest()}
            await start_low(page)
            await keyboard_and_pad(page)
            await context_recovery(page)
            await desktop.close()
            mobile=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
            page=await mobile.new_page()
            await observe(page)
            await page.goto(URL,wait_until='networkidle')
            await page.wait_for_function('window.__BAINHA__')
            await mobile_cases(page)
            assert not report['errors'],report['errors']
            assert not report['failed_http'],report['failed_http']
            report['passed']=True
            await browser.close()
    except Exception as error:
        report['passed']=False
        report['failure']=str(error)
        raise
    finally:
        (OUT/'input-recovery-report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps({'passed':report.get('passed'),'checks':len(report['checks']),'failure':report.get('failure'),'report':str(OUT/'input-recovery-report.json')}),flush=True)

if __name__=='__main__':
    asyncio.run(main())
