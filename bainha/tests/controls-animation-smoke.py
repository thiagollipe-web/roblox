"""Screen-relative input and temporal scene regression checks.

Uses real keyboard/CDP touch events and read-only application diagnostics.
Gamepad coverage uses a clearly labeled navigator.getGamepads input-provider
stub; it does not represent a physical-controller or Bluetooth test.
"""
import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get('BAINHA_URL', 'http://127.0.0.1:8001/prototipo/')
HTML_FILE = os.environ.get('BAINHA_HTML_FILE')
OUT = Path(os.environ.get('BAINHA_ARTIFACTS', '/workspace/onboarding/bainha-controls-animation'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'url': URL if not HTML_FILE else 'about:blank', 'html_file': HTML_FILE,
    'load_method': 'exact offline HTML content fixture' if HTML_FILE else 'HTTP navigation',
    'mapping': '2.5D +Z projects right; X fixed at zero; W/Up/Space jump',
    'quality': 'low selected through the player-facing pause menu',
    'gamepad_method': 'navigator.getGamepads input-provider stub; no physical gamepad tested',
    'checks': [], 'screenshots': [], 'errors': [], 'failed_http': [], 'requests': []}
if HTML_FILE:
    report['html_sha256'] = hashlib.sha256(Path(HTML_FILE).read_bytes()).hexdigest()
ACTIVE_PAGE = None

GAMEPAD_INPUT = '''() => {
  if (window.__QA_GAMEPAD_INPUT__) return;
  const input = {active:false, axes:[0,0,0,0]};
  Object.defineProperty(window, '__QA_GAMEPAD_INPUT__', {value:input});
  Object.defineProperty(navigator, 'getGamepads', {value:() => input.active ? [{
    id:'QA standard gamepad input emulation', index:0, connected:true,
    mapping:'standard', timestamp:performance.now(), axes:[...input.axes],
    buttons:Array.from({length:17}, () => ({pressed:false,touched:false,value:0}))
  }] : []});
}'''

async def snapshot(page):
    return await page.evaluate('window.__BAINHA__.snapshot()')

async def until(page, expression, timeout=15000):
    try:
        await page.wait_for_function('() => {const s=window.__BAINHA__.snapshot();return ' + expression + ';}', timeout=timeout)
    except Exception:
        report['failed_condition']=expression
        report['failure_state']=await snapshot(page)
        await capture(page,'failure')
        raise

async def capture(page, name):
    path = OUT / (name + '.png')
    await page.screenshot(path=str(path))
    report['screenshots'].append({'path':str(path), 'snapshot':await snapshot(page)})

async def check(name, condition, evidence=None):
    if not condition:
        report['failure_state']=await snapshot(ACTIVE_PAGE)
        await capture(ACTIVE_PAGE,'failure')
        raise AssertionError(name + ': ' + json.dumps(evidence))
    report['checks'].append({'name':name, 'evidence':evidence})
    print(name, flush=True)

def project(position, matrix, viewport):
    """Three.js column-major viewProjection matrix -> browser pixel position."""
    x, y, z = position['x'], position['y'] + .75, position['z']
    clip_x = matrix[0]*x + matrix[4]*y + matrix[8]*z + matrix[12]
    clip_y = matrix[1]*x + matrix[5]*y + matrix[9]*z + matrix[13]
    clip_w = matrix[3]*x + matrix[7]*y + matrix[11]*z + matrix[15]
    assert clip_w > 0, 'Player is behind the captured camera'
    return [(clip_x/clip_w+1)*viewport['width']/2, (1-clip_y/clip_w)*viewport['height']/2]

def screen_delta(before, after, viewport):
    # Freeze the BEFORE camera, so follow-camera movement cannot hide or invert
    # the movement being measured. No world-axis sign assumption is involved.
    matrix = before['render']['camera']['viewProjection']
    p0 = project(before['position'], matrix, viewport)
    p1 = project(after['position'], matrix, viewport)
    return {'x':p1[0]-p0[0], 'y':p1[1]-p0[1]}

def changed_values(before, after, minimum=1e-5):
    return {key: after[key]-value for key,value in before.items()
        if isinstance(value,(float,int)) and key in after and abs(after[key]-value)>minimum}

async def wait_displacement(page, start):
    await until(page, f'Math.hypot(s.position.x-({start["x"]}),s.position.z-({start["z"]})) >= .65')

async def settle(page):
    await until(page, 's.grounded && Math.hypot(s.velocity.x,s.velocity.z)<.01')

async def observe(page):
    global ACTIVE_PAGE
    ACTIVE_PAGE=page
    if HTML_FILE:
        await page.context.set_offline(True)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type=='error' else None)
    page.on('response', lambda r: report['failed_http'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.on('request', lambda r: report['requests'].append(r.url) if r.url.startswith(('http://','https://')) else None)
    page.on('requestfailed', lambda r: report['errors'].append(f'{r.url}: {r.failure}'))
    if HTML_FILE:
        await page.set_content(Path(HTML_FILE).read_text(), wait_until='networkidle')
    else:
        await page.goto(URL, wait_until='networkidle')
    await page.wait_for_function('window.__BAINHA__ && !document.querySelector("#menu").hidden')
    await page.locator('#start').click()
    await until(page, 's.started && !s.paused && s.grounded')
    await page.locator('#pause').click()
    await until(page, 's.paused')
    await page.locator('#graphics-quality').select_option('low')
    await until(page, 's.render.quality === "low" && s.render.effectiveQuality === "low"')
    await page.locator('#resume').click()
    await until(page, '!s.paused && s.elapsed>=1.5')

async def restart(page):
    if not (await snapshot(page))['paused']:
        await page.locator('#pause').click()
        await until(page, 's.paused')
    await page.locator('#restart').click()
    await until(page, '!s.paused && s.grounded && s.elapsed>=.8')

async def keyboard_direction(page, key, axis, sign, viewport):
    await restart(page)
    before = await snapshot(page)
    await page.keyboard.down(key)
    try:
        await wait_displacement(page, before['position'])
    finally:
        await page.keyboard.up(key)
    await settle(page)
    after = await snapshot(page)
    delta = screen_delta(before,after,viewport)
    dx=after['position']['x']-before['position']['x']
    dz=after['position']['z']-before['position']['z']
    yaw=after['render']['animation']['yaw']
    facing_dot=(math.sin(yaw)*dx+math.cos(yaw)*dz)/math.hypot(dx,dz)
    await check(f'keyboard {key} moves the correct screen direction', delta[axis]*sign>6 and facing_dot>0 and abs(after['position']['x'])<.001,
        {'projected_delta_px':delta,'expected_axis':axis,'expected_sign':sign,'facing_dot_travel':facing_dot,'deaths':after['deaths']})
    assert after['deaths']==before['deaths']

async def gamepad_direction(page, axes, axis, sign, viewport):
    await restart(page)
    before = await snapshot(page)
    await page.evaluate('(axes)=>{window.__QA_GAMEPAD_INPUT__.axes=axes;window.__QA_GAMEPAD_INPUT__.active=true;}', axes)
    try:
        await wait_displacement(page,before['position'])
    finally:
        await page.evaluate('window.__QA_GAMEPAD_INPUT__.active=false')
    await settle(page)
    after = await snapshot(page)
    delta = screen_delta(before,after,viewport)
    await check(f'emulated gamepad axes {axes[:2]} move the correct screen direction',delta[axis]*sign>6 and abs(after['position']['x'])<.001,
        {'projected_delta_px':delta,'method':report['gamepad_method']})
    assert after['deaths']==before['deaths']

async def keyboard_jump(page,key,viewport):
    await restart(page)
    before=await snapshot(page)
    await page.keyboard.press(key)
    await until(page,'!s.grounded && s.position.y>.35')
    airborne=await snapshot(page)
    delta=screen_delta(before,airborne,viewport)
    await settle(page)
    after=await snapshot(page)
    await check(f'keyboard {key} jumps upward without depth movement',
        delta['y'] < -8 and abs(airborne['position']['x'])<.001
        and abs(after['position']['z']-before['position']['z'])<.01,
        {'projected_delta_px':delta,'position':airborne['position']})

async def ignored_depth_inputs(page):
    await restart(page)
    before=await snapshot(page)
    for key in ('s','ArrowDown'):
        await page.keyboard.down(key)
    await until(page,f's.elapsed>{before["elapsed"]+.4}')
    for key in ('s','ArrowDown'):
        await page.keyboard.up(key)
    after=await snapshot(page)
    await check('S and Down do not move the player out of the 2.5D plane',
        math.dist(before['position'].values(),after['position'].values())<.01,
        {'before':before['position'],'after':after['position']})
    for axis in (-1,1):
        before=await snapshot(page)
        await page.evaluate('(axis)=>{window.__QA_GAMEPAD_INPUT__.axes=[0,axis,0,0];window.__QA_GAMEPAD_INPUT__.active=true;}',axis)
        await until(page,f's.elapsed>{before["elapsed"]+.4}')
        await page.evaluate('window.__QA_GAMEPAD_INPUT__.active=false')
        after=await snapshot(page)
        await check(f'emulated gamepad vertical axis {axis} introduces no depth movement',
            math.dist(before['position'].values(),after['position'].values())<.01,
            {'before':before['position'],'after':after['position']})

async def animations(page):
    await restart(page)
    idle0=await snapshot(page)
    await capture(page,'desktop-idle-0')
    await until(page,f's.render.animation.time >= {idle0["render"]["animation"]["time"]+.37}')
    idle1=await snapshot(page)
    await capture(page,'desktop-idle-1')
    rig_delta=changed_values(idle0['render']['animation']['rig'],idle1['render']['animation']['rig'])
    ambient_delta=changed_values(idle0['render']['animation']['ambient'],idle1['render']['animation']['ambient'])
    await check('idle breathing changes the actual character rig',len(rig_delta)>=2,rig_delta)
    await check('at least three ambient scene transforms animate',len(ambient_delta)>=3,ambient_delta)
    await until(page,'s.render.animation.time>=2.4 && s.render.animation.rig.rightArmX < -.7')
    greeting=await snapshot(page)
    await capture(page,'desktop-idle-wave')
    await check('idle greeting visibly raises the right arm without moving the player',
        greeting['grounded'] and greeting['render']['animation']['mode']=='idle'
        and greeting['render']['animation']['rig']['rightArmX']<-.7
        and math.hypot(greeting['position']['x']-idle0['position']['x'],greeting['position']['z']-idle0['position']['z'])<.01,
        {'animation':greeting['render']['animation'],'position':greeting['position']})

    running=[]
    for index in range(2):
        await page.keyboard.down('d')
        try:
            await until(page,'Math.hypot(s.velocity.x,s.velocity.z)>5')
            running.append(await snapshot(page))
            # Queue key release beside capture; a slow software screenshot must
            # not keep D held until the player walks off the start platform.
            shot=asyncio.create_task(capture(page,f'desktop-run-{index}'))
        finally:
            await page.keyboard.up('d')
        await shot
        await settle(page)
    run0,run1=running
    run_delta=changed_values(run0['render']['animation']['rig'],run1['render']['animation']['rig'])
    await check('running changes opposing limb poses over time',
        len(run_delta)>=3 and any(key in run_delta for key in ('leftLegX','rightLegX')),run_delta)

    await restart(page)
    grounded=await snapshot(page)
    await page.keyboard.press('Space')
    await until(page,'!s.grounded && s.position.y>.35')
    jump0=await snapshot(page)
    await capture(page,'desktop-jump-0')
    await until(page,f's.render.animation.time >= {jump0["render"]["animation"]["time"]+.12}')
    jump1=await snapshot(page)
    await capture(page,'desktop-jump-1')
    jump_delta=changed_values(grounded['render']['animation']['rig'],jump0['render']['animation']['rig'])
    await check('jump uses a distinct rig pose while the capsule is airborne',len(jump_delta)>=3,
        {'pose_changes':jump_delta,'first_height':jump0['position']['y'],'second_height':jump1['position']['y']})
    await settle(page)

    await page.locator('#pause').click()
    await until(page,'s.paused')
    await page.wait_for_timeout(500)
    frozen0=await snapshot(page)
    await capture(page,'desktop-paused')
    await page.wait_for_timeout(500)
    frozen1=await snapshot(page)
    await check('pause freezes actual rig and ambient transforms and GPU submissions',
        frozen0['render']['animation']==frozen1['render']['animation']
        and frozen0['render']['renderedFrames']==frozen1['render']['renderedFrames']
        and frozen1['frames']>frozen0['frames'],
        {'before':frozen0['render']['animation'],'after':frozen1['render']['animation']})
    await page.locator('#resume').click()
    await until(page,f'!s.paused && s.render.animation.time>{frozen1["render"]["animation"]["time"]+.15}')
    resumed=await snapshot(page)
    await check('resume restarts ambient animation',bool(changed_values(frozen1['render']['animation']['ambient'],resumed['render']['animation']['ambient'])))

async def touch_direction(page, cdp, sign, viewport):
    await restart(page)
    box=await page.locator('#touch-zone').bounding_box()
    x,y=box['x']+box['width']/2,box['y']+box['height']/2
    before=await snapshot(page)
    point={'x':x,'y':y,'id':1,'radiusX':4,'radiusY':4,'force':1}
    start=asyncio.create_task(cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]}))
    await asyncio.sleep(.016)
    move=asyncio.create_task(cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**point,'x':x+sign*35}]}))
    await asyncio.gather(start,move)
    try:
        await until(page,'!s.aiming')
        await wait_displacement(page,before['position'])
        during=await snapshot(page)
        knob=await page.locator('#joystick-knob').evaluate('(el)=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41')
        # Release input beside capture so slow screenshots cannot walk off the ledge.
        shot=asyncio.create_task(capture(page,'portrait-drag-'+('right' if sign>0 else 'left')))
    finally:
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    await shot
    await settle(page)
    delta=screen_delta(before,during,viewport)
    await check('portrait '+('right' if sign>0 else 'left')+' drag moves player and joystick in the same screen direction',
        delta['x']*sign>6 and knob*sign>10 and abs(during['position']['x'])<.001,
        {'projected_delta_px':delta,'joystick_translate_x':knob})
    assert (await snapshot(page))['deaths']==before['deaths']

async def main():
    page=None
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
                args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            viewport={'width':1280,'height':720}
            desktop=await browser.new_context(viewport=viewport,device_scale_factor=1)
            page=await desktop.new_page()
            await observe(page)
            await capture(page,'desktop-final-1280x720')
            # Install after navigation/set_content. This changes only the
            # input provider; no game state or diagnostics are changed.
            await page.evaluate(GAMEPAD_INPUT)
            for key,axis,sign in [('ArrowRight','x',1),('ArrowLeft','x',-1),('d','x',1),('a','x',-1)]:
                await keyboard_direction(page,key,axis,sign,viewport)
            for axes,axis,sign in [([1,0,0,0],'x',1),([-1,0,0,0],'x',-1)]:
                await gamepad_direction(page,axes,axis,sign,viewport)
            for key in ('w','ArrowUp','Space'):
                await keyboard_jump(page,key,viewport)
            await ignored_depth_inputs(page)
            await animations(page)
            await desktop.close()

            viewport={'width':390,'height':844}
            mobile=await browser.new_context(viewport=viewport,device_scale_factor=1,is_mobile=True,has_touch=True)
            page=await mobile.new_page()
            await observe(page)
            cdp=await mobile.new_cdp_session(page)
            await touch_direction(page,cdp,1,viewport)
            await touch_direction(page,cdp,-1,viewport)
            overflow=await page.evaluate('({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight})')
            await check('portrait controls have no document overflow',overflow=={'x':0,'y':0},overflow)
            for width,height in ((844,390),(568,320)):
                await page.set_viewport_size({'width':width,'height':height})
                await restart(page)
                await capture(page,f'landscape-{width}x{height}')
                boxes=await page.locator('#pause,#jump,#action,#touch-zone').evaluate_all('(els)=>els.map(el=>{const r=el.getBoundingClientRect();return {id:el.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})')
                await check(f'landscape {width}x{height} controls stay visible',all(b['x']>=0 and b['y']>=0 and b['right']<=width and b['bottom']<=height for b in boxes),boxes)
            assert not report['errors'],report['errors']
            assert not report['failed_http'],report['failed_http']
            if HTML_FILE:
                assert not report['requests'],report['requests']
            report['passed']=True
            await browser.close()
    except Exception as error:
        report['passed']=False
        report['failure']=str(error)
        if page and not page.is_closed():
            try:
                report['failure_state']=await snapshot(page)
                await capture(page,'failure')
            except Exception:
                pass
        raise
    finally:
        (OUT/'controls-animation-report.json').write_text(json.dumps(report,indent=2))
        print(json.dumps({'passed':report.get('passed'),'checks':len(report['checks']),'failure':report.get('failure'),'report':str(OUT/'controls-animation-report.json')}),flush=True)

if __name__=='__main__':
    asyncio.run(main())
