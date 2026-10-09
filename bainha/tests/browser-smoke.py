"""Browser gameplay smoke: real keyboard / CDP touch input, read-only snapshots.

Requires Python Playwright and Chromium. Does not mutate application state.
"""
import json
import os
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
BASE = os.environ.get('BAINHA_URL', 'http://127.0.0.1:8001/prototipo/')
OUT = Path(os.environ.get('BAINHA_ARTIFACTS', '/workspace/onboarding/bainha'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'url': BASE, 'input_method': 'Playwright keyboard and Chromium CDP touch events; snapshots read only', 'checks': [], 'errors': [], 'failed_http': [], 'screenshots': []}

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
    assert condition, name
    report['checks'].append({'name': name, 'state': await snap(page)})
    print(name, flush=True)

async def capture(page, name):
    path = OUT / (name + '.png')
    await page.screenshot(path=str(path))
    report['screenshots'].append(str(path))

async def observe(page):
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('response', lambda r: report['failed_http'].append({'url': r.url, 'status': r.status}) if r.status >= 400 else None)
    page.on('requestfailed', lambda r: report['errors'].append('request failed: ' + r.url + ': ' + str(r.failure)))
    page.set_default_timeout(30000)
    await page.goto(BASE, wait_until='networkidle')
    await page.wait_for_function('window.__BAINHA__ && !document.querySelector("#menu").hidden')

async def move_keyboard(page, z):
    await page.keyboard.down('w')
    try:
        await wait(page, f's.position.z >= {z}')
    finally:
        await page.keyboard.up('w')
    await page.wait_for_timeout(250)

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

    async def start_move(self):
        """Queue a real drag before waiting for slow software-renderer ACKs.

        Synchronous CDP calls each took 140–270 ms in diagnosis. Waiting for
        touchStart's acknowledgment can accidentally generate a long press.
        Send movement one input frame later while touchStart is in flight.
        """
        start = asyncio.create_task(self.send('touchStart'))
        await asyncio.sleep(.016)
        move = asyncio.create_task(self.send('touchMove', y=self.y - 55))
        await asyncio.gather(start, move)
        events = await self.page.evaluate('window.__touchQA.slice(-2)')
        assert [e['type'] for e in events] == ['pointerdown', 'pointermove'], events
        gap = events[1]['timestamp'] - events[0]['timestamp']
        assert 0 <= gap < 220, f'Injected drag arrived too slowly: {gap} ms'
        report.setdefault('drag_input_gaps_ms', []).append(gap)
        assert not (await snap(self.page))['aiming'], 'Immediate drag was classified as aim'

    async def move(self, z):
        await self.start_move()
        try:
            await wait(self.page, f's.position.z >= {z}')
        finally:
            await self.send('touchEnd')
        await self.page.wait_for_timeout(300)

async def main():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            desktop = await browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
            page = await desktop.new_page()
            await observe(page)
            await capture(page, 'desktop-menu')
            await page.locator('#start').click()
            await wait(page, 's.started && !s.paused')
            await check('desktop boot/start', page)
            await page.keyboard.press('Space')
            await wait(page, 's.position.y > .15')
            await check('desktop jump', page)
            await wait(page, 's.grounded')
            await page.keyboard.press('e')
            await wait(page, 's.pair === 0')
            await move_keyboard(page, 8.5)
            await capture(page, 'desktop-bridge')
            await check('desktop ribbon traversal', page, (await snap(page))['onRibbon'])
            await move_keyboard(page, 18)
            await page.keyboard.press('e')
            await wait(page, 's.pair === 1')
            await page.keyboard.press('e')
            await wait(page, 's.taut && s.enemy === "missed"')
            await page.keyboard.press('e')
            await wait(page, 's.enemy === "captured"')
            await check('desktop enemy puzzle', page)
            await move_keyboard(page, 37)
            await page.keyboard.press('e')
            await wait(page, 's.pair === 2')
            await page.keyboard.press('e')
            await wait(page, 's.taut && s.bossReady')
            await capture(page, 'desktop-boss-ready')
            await wait(page, 's.bossReady')
            await page.keyboard.press('e')
            await wait(page, 's.canalOpen')
            await capture(page, 'desktop-launch')
            await wait(page, 's.grounded && s.position.z > 43')
            await check('desktop boss launch/landing', page)
            await move_keyboard(page, 45)
            await wait(page, 's.won')
            await capture(page, 'desktop-win')
            await check('desktop complete game', page)
            await page.locator('#again').click()
            await wait(page, 's.started && !s.won && s.checkpoint === 0 && s.pair === null')
            await check('desktop restart', page)
            await page.keyboard.press('Escape')
            await wait(page, 's.paused')
            before = (await snap(page))['position']
            await page.keyboard.down('w')
            await page.wait_for_timeout(500)
            await page.keyboard.up('w')
            await check('desktop pause blocks movement', page, (await snap(page))['position'] == before)
            await page.locator('#resume').click()
            await wait(page, '!s.paused')
            await check('desktop resume', page)
            await desktop.close()
            mobile = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
            page = await mobile.new_page()
            await observe(page)
            await capture(page, 'portrait-menu')
            await page.locator('#start').tap()
            await wait(page, 's.started')
            await page.wait_for_timeout(600)
            await wait(page, 's.grounded && !s.paused')
            await capture(page, 'portrait-start')
            touch = await Touch.create(page)
            await page.touchscreen.tap(touch.x, touch.y)
            await wait(page, 's.position.y > .15')
            await check('portrait one-thumb tap jump', page)
            await wait(page, 's.grounded')
            await touch.send('touchStart')
            await wait(page, 's.aiming')
            await touch.send('touchCancel')
            await wait(page, '!s.aiming')
            await check('portrait pointercancel preserves no ribbon', page, (await snap(page))['pair'] is None)
            await touch.send('touchStart')
            await wait(page, 's.aiming')
            await touch.send('touchMove', y=touch.y + 60)
            await touch.send('touchEnd')
            await check('portrait downward aim cancellation', page, (await snap(page))['pair'] is None)
            await touch.hold()
            await wait(page, 's.pair === 0')
            await check('portrait one-thumb hold creates ribbon', page)
            await touch.move(8.5)
            await capture(page, 'portrait-bridge')
            await check('portrait one-thumb drag traversal', page, (await snap(page))['onRibbon'])
            await touch.move(18)
            await touch.hold()
            await wait(page, 's.pair === 1')
            await touch.hold()
            await wait(page, 's.taut && s.enemy === "missed"')
            await touch.hold()
            await wait(page, 's.enemy === "captured"')
            await check('portrait one-thumb enemy puzzle', page)
            await touch.move(36.8)
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
            await wait(page, 's.grounded && s.position.z > 43')
            await check('portrait one-thumb launch/landing', page)
            await touch.move(45)
            await wait(page, 's.won')
            await capture(page, 'portrait-win')
            await check('portrait full one-thumb completion', page)
            await page.locator('#again').tap()
            await wait(page, '!s.won && s.checkpoint === 0')
            await check('portrait restart', page)
            await touch.start_move()
            await wait(page, 's.position.z > .4')
            await touch.send('touchCancel')
            await page.wait_for_timeout(300)
            before = (await snap(page))['position']['z']
            await page.wait_for_timeout(500)
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
            report['portrait_overflow'] = await page.evaluate('({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight})')
            assert report['portrait_overflow'] == {'x': 0, 'y': 0}, 'portrait document overflow'
            await browser.close()
            assert not report['errors'], report['errors']
            assert not report['failed_http'], report['failed_http']
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
asyncio.run(main())
