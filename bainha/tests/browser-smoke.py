"""Browser gameplay smoke: real keyboard / CDP touch input, read-only snapshots.

Requires Python Playwright and Chromium. Does not mutate application state.
Default route: desktop 1280x720 and mobile landscape 844x390.
BAINHA_DEVICE=portrait explicitly exercises the 390x844 fallback.
"""
import json
import os
import asyncio
import hashlib
from pathlib import Path
from playwright.async_api import async_playwright
BASE = os.environ.get('BAINHA_URL', 'http://127.0.0.1:8001/prototipo/')
OFFLINE = os.environ.get('BAINHA_OFFLINE') == '1'
HTML_FILE = os.environ.get('BAINHA_HTML_FILE')
DEVICE = os.environ.get('BAINHA_DEVICE', 'all')
MOBILE_LABEL = 'portrait' if DEVICE == 'portrait' else 'landscape'
MOBILE_VIEWPORT = {'width':390,'height':844} if DEVICE == 'portrait' else {'width':844,'height':390}
if DEVICE not in ('all', 'desktop', 'mobile', 'portrait'):
    raise ValueError('BAINHA_DEVICE must be all, desktop, mobile, or portrait')
OUT = Path(os.environ.get('BAINHA_ARTIFACTS', '/workspace/onboarding/bainha-redesign'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'url': BASE if not HTML_FILE else 'about:blank', 'html_file': HTML_FILE, 'load_method': 'HTML content fixture' if HTML_FILE else 'navigation', 'offline': OFFLINE, 'device': DEVICE, 'mobile_viewport': MOBILE_VIEWPORT, 'mapping': '2.5D: D/right drag advances +Z; X remains zero', 'input_method': 'Playwright keyboard and Chromium CDP touch events; snapshots read only', 'checks': [], 'errors': [], 'failed_http': [], 'external_requests': [], 'screenshots': []}
if HTML_FILE:
    report['html_sha256'] = hashlib.sha256(Path(HTML_FILE).read_bytes()).hexdigest()

async def snap(page):
    return await page.evaluate('window.__BAINHA__.snapshot()')

async def wait(page, condition, timeout=60000):
    try:
        await page.wait_for_function('() => { const s=window.__BAINHA__.snapshot(); return ' + condition + '; }', timeout=timeout)
    except Exception:
        # Capture before leaving the Playwright context closes its browser.
        report['failed_condition'] = condition
        report['failure_state'] = await snap(page)
        report['failure_browser'] = await page.evaluate('({hidden:document.hidden,focused:document.hasFocus(),events:window.__touchQA || []})')
        await capture(page, 'failure')
        raise

async def check(name, page, condition=True):
    name = name.replace('portrait', MOBILE_LABEL)
    state = await snap(page)
    await assert_condition(page, abs(state['position']['x']) < .001 and abs(state['velocity']['x']) < .001, 'Player left the 2.5D rail')
    await assert_condition(page, condition, name)
    report['checks'].append({'name': name, 'state': await snap(page)})
    print(name, flush=True)

async def assert_condition(page, condition, name):
    if not condition:
        report['failure_state'] = await snap(page)
        report['failure_browser'] = await page.evaluate('({hidden:document.hidden,focused:document.hasFocus(),events:window.__touchQA || []})')
        await capture(page, 'failure')
        raise AssertionError(name)

async def capture(page, name):
    path = OUT / (name.replace('portrait', MOBILE_LABEL) + '.png')
    await page.screenshot(path=str(path))
    report['screenshots'].append(str(path))

async def observe(page):
    if OFFLINE:
        await page.context.set_offline(True)
    page.on('request', lambda r: report['external_requests'].append(r.url) if r.url.startswith(('http://', 'https://')) else None)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda message: report['errors'].append('console.error: ' + message.text) if message.type == 'error' else None)
    page.on('response', lambda r: report['failed_http'].append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)
    page.on('requestfailed', lambda r: report['errors'].append('request failed: ' + r.url + ': ' + str(r.failure)))
    page.set_default_timeout(30000)
    if HTML_FILE:
        await page.set_content(Path(HTML_FILE).read_text(), wait_until='networkidle')
    else:
        await page.goto(BASE, wait_until='networkidle')
    await page.wait_for_function('window.__BAINHA__ && !document.querySelector("#menu").hidden')

async def begin_camera_trace(page):
    # Observe rendered transforms without changing simulation or renderer state.
    await page.evaluate('''() => {
      window.__routeCameraQA={active:true,frames:[]};
      let last=-1;
      function sample(){
        const trace=window.__routeCameraQA;
        if(!trace.active)return;
        const s=window.__BAINHA__.snapshot(), r=s.render;
        if(s.started&&!s.paused&&last!==r.renderedFrames){
          last=r.renderedFrames;
          const p=r.camera.hero,m=r.camera.viewProjection,y=p.y+.75;
          const cx=m[0]*p.x+m[4]*y+m[8]*p.z+m[12];
          const cy=m[1]*p.x+m[5]*y+m[9]*p.z+m[13];
          const cw=m[3]*p.x+m[7]*y+m[11]*p.z+m[15];
          trace.frames.push({elapsed:s.elapsed,hero:[(cx/cw+1)*innerWidth/2,(1-cy/cw)*innerHeight/2],cameraY:r.camera.position.y,feetY:p.y,grounded:s.grounded});
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }''')

async def check_camera_trace(page):
    trace=await page.evaluate('()=>{window.__routeCameraQA.active=false;return window.__routeCameraQA.frames;}')
    width,height=page.viewport_size['width'],page.viewport_size['height']
    bounds={'left':min(t['hero'][0] for t in trace),'right':max(t['hero'][0] for t in trace),
        'top':min(t['hero'][1] for t in trace),'bottom':max(t['hero'][1] for t in trace)}
    largest_step=max(abs(b['cameraY']-a['cameraY']) for a,b in zip(trace,trace[1:]))
    report['mobile_camera_trace']={'frames':len(trace),'hero_center_bounds_px':bounds,'largest_vertical_camera_step':largest_step,'maximum_launch_height':max(t['feetY'] for t in trace)}
    (OUT/'mobile-camera-trace.json').write_text(json.dumps(trace,indent=2))
    await check('mobile route keeps jumps and launch visible with continuous camera tracking',page,
        bounds['left']>20 and bounds['right']<width-20 and bounds['top']>20
        and bounds['bottom']<height-20 and largest_step<.65)

async def move_keyboard(page, z):
    await page.keyboard.down('d')
    try:
        await wait(page, f's.position.z >= {z} || s.won')
    finally:
        await page.keyboard.up('d')
    await page.wait_for_timeout(250)

async def jump_keyboard(page, takeoff, landing, minimum_height):
    """Cross a gap using normal movement and a real Space press."""
    deaths = (await snap(page))['deaths']
    await page.keyboard.down('d')
    try:
        await wait(page, f's.position.z >= {takeoff}')
        await page.keyboard.press('Space')
        await wait(page, f's.position.y > {minimum_height} || s.deaths > {deaths}')
        await wait(page, f's.position.z >= {landing} || s.deaths > {deaths}')
    finally:
        await page.keyboard.up('d')
    await wait(page, 's.grounded')
    await page.wait_for_timeout(160)
    await assert_condition(page, (await snap(page))['deaths'] == deaths, f'Keyboard jump failed at z={takeoff}')

async def select_quality(page, mode):
    """Exercise the player-facing select; diagnostics remain strictly read-only."""
    await page.locator('#graphics-quality').select_option(mode)
    expected = f's.render.quality === "{mode}"'
    if mode != 'auto':
        expected += f' && s.render.effectiveQuality === "{mode}"'
        expected += ' && s.render.shadowMode === ' + ('"blob"' if mode == 'low' else '"dynamic"')
    await wait(page, expected)

async def check_paused_render(page):
    # Allow the single dirty frame from opening the menu to finish first.
    await page.wait_for_timeout(600)
    before = await snap(page)
    await page.wait_for_timeout(1200)
    after = await snap(page)
    await check('desktop pause stops GPU submissions while RAF stays responsive', page,
        before['paused'] and after['paused']
        and before['position'] == after['position']
        and before['render']['renderedFrames'] == after['render']['renderedFrames']
        and after['frames'] > before['frames'])

class Touch:

    def __init__(self, page, cdp, box):
        self.page = page
        self.cdp = cdp
        self.x = box['x'] + box['width'] / 2
        self.y = box['y'] + box['height'] / 2

    @classmethod
    async def create(cls, page):
        cdp = await page.context.new_cdp_session(page)
        box = await page.locator('#touch-zone').bounding_box()
        await page.evaluate('''() => {
            window.__touchQA = [];
            for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) {
                document.addEventListener(type, event => {
                    const state = window.__BAINHA__.snapshot();
                    window.__touchQA.push({type, target:event.target.id,
                        timestamp:event.timeStamp, delivered:performance.now(),
                        aiming:state.aiming, paused:state.paused});
                }, true);
            }
        }''')
        return cls(page, cdp, box)

    async def send(self, kind, x=None, y=None):
        points = [] if kind in ('touchEnd', 'touchCancel') else [{'x': self.x if x is None else x, 'y': self.y if y is None else y, 'id': 1, 'radiusX': 4, 'radiusY': 4, 'force': 1}]
        await self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

    async def hold(self):
        await self.send('touchStart')
        await wait(self.page, 's.aiming', 10000)
        await self.send('touchEnd')
        await self.page.wait_for_timeout(100)

    async def start_move(self, direction=1, distance=42):
        """Queue a real drag before waiting for slow software-renderer ACKs.

        Synchronous CDP calls each took 140–270 ms in diagnosis. Waiting for
        touchStart's acknowledgment can accidentally generate a long press.
        Send movement one input frame later while touchStart is in flight.
        """
        start = asyncio.create_task(self.send('touchStart'))
        await asyncio.sleep(.016)
        move = asyncio.create_task(self.send('touchMove', x=self.x + direction * distance, y=self.y - 20))
        await asyncio.gather(start, move)
        events = await self.page.evaluate('window.__touchQA.slice(-2)')
        await assert_condition(self.page, [e['type'] for e in events] == ['pointerdown', 'pointermove'], str(events))
        gap = events[1]['timestamp'] - events[0]['timestamp']
        await assert_condition(self.page, 0 <= gap < 220, f'Injected drag arrived too slowly: {gap} ms')
        report.setdefault('drag_input_gaps_ms', []).append(gap)
        await assert_condition(self.page, not (await snap(self.page))['aiming'], 'Immediate drag was classified as aim')

    async def center_on_launch(self):
        """Correct CDP delivery/coasting overshoot using normal slow steering.

        The flower accepts z=56..58. Under software rendering, the jump's
        touchEnd can arrive several frames late; do what a player does and
        step back onto its center instead of assuming the landing was centered.
        """
        for _ in range(3):
            state = await snap(self.page)
            if abs(state['position']['z'] - 57) <= .65:
                break
            direction = 1 if state['position']['z'] < 57 else -1
            await self.start_move(direction=direction, distance=12)
            try:
                condition = 's.position.z >= 56.8' if direction == 1 else 's.position.z <= 57.2'
                await wait(self.page, condition, 10000)
            finally:
                await self.send('touchEnd')
            await wait(self.page, 's.grounded && Math.abs(s.velocity.z) < .01')
        state = await snap(self.page)
        await check('portrait steers onto the launch flower center', self.page,
            state['grounded'] and state['position']['y'] > 3.1
            and abs(state['position']['x']) < .001
            and abs(state['position']['z'] - 57) <= 1)

    async def move(self, z):
        await self.start_move()
        try:
            await wait(self.page, f's.position.z >= {z} || s.won')
        finally:
            await self.send('touchEnd')
        await self.page.wait_for_timeout(300)

    async def jump_to(self, takeoff, landing, minimum_height, precision=False):
        """One finger keeps steering while its upward flick requests a jump."""
        deaths = (await snap(self.page))['deaths']
        await self.start_move(distance=22 if precision else 42)
        try:
            await wait(self.page, f's.position.z >= {takeoff}')
            if precision:
                # Same-type touchMove events are coalesced if queued together.
                # Observe the apex concurrently, await actual flick delivery,
                # then reset its vertical offset while retaining half-tilt steering.
                height = asyncio.create_task(wait(self.page,
                    f's.position.y > {minimum_height} || s.deaths > {deaths}', 10000))
                await self.send('touchMove', x=self.x + (22 if precision else 42), y=self.y - 108)
                await wait(self.page, 's.velocity.y > 0 || s.position.y > 3.2', 10000)
                await self.send('touchMove', x=self.x + 22, y=self.y - 20)
                await height
            else:
                await self.send('touchMove', x=self.x + (22 if precision else 42), y=self.y - 108)
                await wait(self.page, f's.position.y > {minimum_height} || s.deaths > {deaths}')
            await wait(self.page, f's.position.z >= {landing} || s.deaths > {deaths}')
        finally:
            await self.send('touchEnd')
        await wait(self.page, 's.grounded')
        await self.page.wait_for_timeout(160)
        await assert_condition(self.page, (await snap(self.page))['deaths'] == deaths, f'One-thumb jump failed at z={takeoff}')

async def main():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            if DEVICE in ('all', 'desktop'):
                desktop = await browser.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
                page = await desktop.new_page()
                await observe(page)
                await capture(page, 'desktop-menu')
                await page.locator('#start').click()
                await wait(page, 's.started && !s.paused')
                await check('desktop boot/start', page)
                await check('desktop WebGL2 canvas', page, await page.evaluate('!!document.querySelector("#scene canvas").getContext("webgl2")'))
                await page.keyboard.press('Space')
                await wait(page, 's.position.y > .3')
                await check('desktop jump', page)
                await wait(page, 's.grounded')
                await jump_keyboard(page, 4, 7.2, .9)
                await check('desktop first elevated platform', page, (await snap(page))['position']['y'] > .6)
                await jump_keyboard(page, 8.6, 11.6, 1.6)
                await capture(page, 'desktop-elevated-platforms')
                await check('desktop second elevated platform', page, (await snap(page))['position']['y'] > 1.2)
                await jump_keyboard(page, 12.9, 16.5, 1.6)
                await move_keyboard(page, 21.5)
                await wait(page, 's.checkpoint === 1')
                state = await snap(page)
                await check('desktop collects coins along the jump route', page, state['coins'] >= 4)
                coins_before_fall = state['coins']
                deaths_before_fall = state['deaths']
                await page.keyboard.down('d')
                try:
                    await wait(page, f's.deaths > {deaths_before_fall}')
                finally:
                    await page.keyboard.up('d')
                await wait(page, 's.grounded')
                state = await snap(page)
                await check('desktop fall returns to checkpoint and retains coins', page,
                    state['checkpoint'] == 1 and abs(state['position']['z'] - 20) < .5 and state['coins'] >= coins_before_fall)
                await move_keyboard(page, 22)
                await page.keyboard.press('e')
                await wait(page, 's.pair === 0')
                await move_keyboard(page, 29)
                await capture(page, 'desktop-bridge')
                await check('desktop ribbon traversal', page, (await snap(page))['onRibbon'])
                await move_keyboard(page, 41)
                await page.keyboard.press('e')
                await wait(page, 's.pair === 1')
                await page.keyboard.press('e')
                await wait(page, 's.taut && s.enemy === "missed"')
                await page.keyboard.press('e')
                await wait(page, 's.enemy === "captured"')
                await check('desktop enemy puzzle', page)
                await move_keyboard(page, 53.5)
                await jump_keyboard(page, 54.2, 56.6, 3.5)
                await wait(page, 's.grounded && s.position.y > 3.1')
                await page.keyboard.press('e')
                await wait(page, 's.pair === 2')
                await page.keyboard.press('e')
                await wait(page, 's.taut && s.bossReady')
                await capture(page, 'desktop-boss-ready')
                await wait(page, 's.bossReady')
                await page.keyboard.press('e')
                await wait(page, 's.canalOpen')
                await capture(page, 'desktop-launch')
                await wait(page, 's.grounded && s.position.z > 63')
                await check('desktop boss launch/landing', page)
                await move_keyboard(page, 68)
                await wait(page, 's.won')
                await capture(page, 'desktop-win')
                await check('desktop complete game', page)
                await page.locator('#again').click()
                await wait(page, 's.started && !s.won && s.checkpoint === 0 && s.pair === null && s.coins === 0')
                await check('desktop restart clears collectibles', page)
                await page.keyboard.press('Escape')
                await wait(page, 's.paused')
                before = (await snap(page))['position']
                await page.keyboard.down('d')
                await page.wait_for_timeout(500)
                await page.keyboard.up('d')
                await check('desktop pause blocks movement', page, (await snap(page))['position'] == before)
                await check_paused_render(page)
                for mode in ('low', 'high'):
                    await select_quality(page, mode)
                    await check(f'desktop quality select applies {mode}', page)
                    await page.locator('#resume').click()
                    await wait(page, '!s.paused')
                    await page.keyboard.press('Space')
                    await wait(page, 's.position.y > .3')
                    await wait(page, 's.grounded')
                    await capture(page, f'desktop-quality-{mode}')
                    await check(f'desktop real jump remains playable in {mode} quality', page)
                    await page.keyboard.press('Escape')
                    await wait(page, 's.paused')
                await page.locator('#graphics-quality').focus()
                await page.keyboard.press('Home')
                await wait(page, 's.render.quality === "auto"')
                await page.keyboard.press('ArrowDown')
                await wait(page, 's.render.quality === "high" && s.render.effectiveQuality === "high"')
                await check('desktop native graphics select accepts keyboard arrow input', page)
                await page.keyboard.press('Tab')
                await select_quality(page, 'auto')
                await check('desktop restores automatic graphics', page)
                await page.locator('#resume').click()
                await wait(page, '!s.paused')
                await check('desktop resume', page)
                await desktop.close()
            if DEVICE != 'desktop':
                mobile = await browser.new_context(viewport=MOBILE_VIEWPORT, device_scale_factor=1, is_mobile=True, has_touch=True)
                page = await mobile.new_page()
                await observe(page)
                await capture(page, 'portrait-menu')
                await page.locator('#start').tap()
                await wait(page, 's.started')
                await page.wait_for_timeout(600)
                await wait(page, 's.grounded && !s.paused')
                # Let the automatic graphics controller finish its startup
                # observation window before latency-sensitive CDP gestures.
                await wait(page, 's.elapsed >= 5')
                await capture(page, 'portrait-start')
                await begin_camera_trace(page)
                touch = await Touch.create(page)
                await page.touchscreen.tap(touch.x, touch.y)
                await wait(page, 's.position.y > .15')
                await check('portrait one-thumb tap jump', page)
                await wait(page, 's.grounded')
                await touch.jump_to(3.5, 6.95, .9)
                await check('portrait one-thumb flick jumps to first platform', page, (await snap(page))['position']['y'] > .6)
                await touch.jump_to(8.6, 11.1, 1.6)
                await capture(page, 'portrait-elevated-platforms')
                await check('portrait one-thumb second elevated jump', page, (await snap(page))['position']['y'] > 1.2)
                await touch.jump_to(12.9, 16.5, 1.6)
                await touch.move(22)
                await check('portrait jump route and coin collection', page,
                    (await snap(page))['checkpoint'] == 1 and (await snap(page))['coins'] >= 4)
                await touch.send('touchStart')
                await wait(page, 's.aiming')
                await touch.send('touchCancel')
                await wait(page, '!s.aiming')
                await check('portrait pointercancel preserves no ribbon near valid anchor', page, (await snap(page))['pair'] is None)
                await touch.send('touchStart')
                await wait(page, 's.aiming')
                await touch.send('touchMove', y=touch.y + 60)
                await touch.send('touchEnd')
                await check('portrait downward aim cancellation near valid anchor', page, (await snap(page))['pair'] is None)
                await touch.hold()
                await wait(page, 's.pair === 0')
                await check('portrait one-thumb hold creates ribbon', page)
                await touch.move(29)
                await capture(page, 'portrait-bridge')
                await check('portrait one-thumb drag traversal', page, (await snap(page))['onRibbon'])
                await touch.move(41)
                await touch.hold()
                await wait(page, 's.pair === 1')
                await touch.hold()
                await wait(page, 's.taut && s.enemy === "missed"')
                await touch.hold()
                await wait(page, 's.enemy === "captured"')
                await check('portrait one-thumb enemy puzzle', page)
                await touch.move(52)
                await touch.jump_to(53.5, 56.2, 3.5, precision=True)
                await wait(page, 's.grounded && s.position.y > 3.1')
                await touch.center_on_launch()
                await touch.hold()
                await wait(page, 's.pair === 2')
                await touch.hold()
                await wait(page, 's.taut && s.bossReady')
                await capture(page, 'portrait-boss-ready')
                await wait(page, 's.bossReady')
                await touch.hold()
                if not (await snap(page))['canalOpen']:
                    await touch.hold()
                    await wait(page, 's.taut && s.bossReady')
                    await touch.hold()
                await wait(page, 's.canalOpen')
                await wait(page, 's.position.y>6')
                await capture(page, 'portrait-launch-arc')
                await wait(page, 's.grounded && s.position.z > 63')
                await check('portrait one-thumb launch/landing', page)
                await touch.move(68)
                await wait(page, 's.won')
                await capture(page, 'portrait-win')
                await check('portrait full one-thumb completion', page)
                await check_camera_trace(page)
                await page.locator('#again').tap()
                await wait(page, '!s.won && s.checkpoint === 0 && s.coins === 0')
                await check('portrait restart clears collectibles', page)
                await page.locator('#pause').tap()
                await wait(page, 's.paused')
                await select_quality(page, 'low')
                await check('portrait quality select applies performance mode', page)
                await capture(page, 'portrait-quality-menu')
                await page.locator('#resume').tap()
                await wait(page, '!s.paused')
                await page.touchscreen.tap(touch.x, touch.y)
                await wait(page, 's.position.y > .15')
                await wait(page, 's.grounded')
                await check('portrait real touch jump remains playable in performance mode', page)
                await page.locator('#pause').tap()
                await wait(page, 's.paused')
                await select_quality(page, 'auto')
                await page.locator('#resume').tap()
                await wait(page, '!s.paused')
                await check('portrait restores automatic graphics and resumes', page)
                quality_settled_at = (await snap(page))['elapsed'] + 5
                await wait(page, f's.elapsed >= {quality_settled_at}')
                await touch.start_move()
                await wait(page, 's.position.z > .4')
                await touch.send('touchCancel')
                await wait(page, 's.grounded && Math.abs(s.velocity.x) < .01 && Math.abs(s.velocity.z) < .01')
                settled = await snap(page)
                before = settled['position']['z']
                await wait(page, f's.elapsed >= {settled["elapsed"] + .3}')
                await check('portrait pointercancel stops movement', page, abs((await snap(page))['position']['z'] - before) < 0.02)
                other = await mobile.new_page()
                await other.goto('about:blank')
                await other.bring_to_front()
                await page.wait_for_timeout(300)
                focus_switch_paused = (await snap(page))['paused']
                report['headless_focus_switch_paused'] = focus_switch_paused
                if not focus_switch_paused:
                    await page.evaluate('window.dispatchEvent(new Event("blur"))')
                    report['blur_handler_method'] = 'synthetic DOM blur event; headless page focus did not produce blur'
                else:
                    report['blur_handler_method'] = 'actual browser page focus switch'
                await wait(page, 's.paused && !s.aiming')
                await page.bring_to_front()
                await other.close()
                await page.locator('#resume').tap()
                await wait(page, '!s.paused')
                await touch.start_move()
                await wait(page, f's.position.z > {before + 0.4}')
                await touch.send('touchCancel')
                await check('portrait blur pause and resumed input', page)
                report['mobile_overflow'] = await page.evaluate('({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight})')
                assert report['mobile_overflow'] == {'x': 0, 'y': 0}, 'mobile document overflow'
            await browser.close()
            assert not report['errors'], report['errors']
            assert not report['failed_http'], report['failed_http']
            if OFFLINE:
                assert not report['external_requests'], report['external_requests']
            report['passed'] = True
    except Exception as e:
        report['passed'] = False
        report['failure'] = str(e)
        try:
            report['failure_state'] = await snap(page)
        except Exception:
            pass
        raise
    finally:
        (OUT / 'browser-smoke-report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps({'passed': report.get('passed'), 'checks': len(report['checks']), 'failure': report.get('failure'), 'report': str(OUT / 'browser-smoke-report.json')}), flush=True)
if __name__ == '__main__':
    asyncio.run(main())
