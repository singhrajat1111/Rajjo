import os
import json
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
from langchain_core.tools import tool

try:
    from backend.config import DATA_DIR
except ImportError:
    from config import DATA_DIR

SCREENSHOTS_DIR = DATA_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

CAPTCHA_PATTERNS = [
    "just a moment...",
    "verify you are human",
    "are you human",
    "please verify that you are not a robot",
    "cf-chl-bypass",
    "recaptcha",
    "hcaptcha",
    "turnstile",
    "security check to continue",
    "unusual traffic from your computer network",
    "challenge-running",
    "enable javascript and cookies to continue",
    "attention required! | cloudflare",
    "pardon our interruption"
]

def check_for_captcha(text: str, title: str) -> Tuple[bool, str]:
    """Check if page content or title matches known bot-challenge / CAPTCHA barriers."""
    haystack = f"{title.lower()} {text[:1500].lower()}"
    for pattern in CAPTCHA_PATTERNS:
        if pattern in haystack:
            return True, pattern
    return False, ""

def _launch_best_chromium(p, headless: bool = True):
    """
    Attempts to launch user's real installed Chrome or Edge first (Native default browser feel),
    falling back to Playwright bundled Chromium.
    Supports CDP connection if Chrome is already running with remote debugging port 9222.
    """
    # 1. Try connecting to active CDP browser if open on port 9222
    try:
        browser = p.chromium.connect_over_cdp("http://localhost:9222", timeout=1500)
        return browser, "cdp_remote_connected"
    except Exception:
        pass

    # 2. Try launching system installed Google Chrome or Edge
    for ch in ["chrome", "msedge", None]:
        try:
            kwargs = {
                "headless": headless,
                "args": ["--disable-blink-features=AutomationControlled"]
            }
            if ch:
                kwargs["channel"] = ch
            browser = p.chromium.launch(**kwargs)
            return browser, f"native_channel_{ch or 'chromium'}"
        except Exception:
            continue

    raise RuntimeError("No compatible Chromium / Chrome browser found. Please run: playwright install chromium")

# Global active browser session for multi-step click/type/scroll automation
_active_browser_context = None
_active_browser_page = None

@tool
def open_browser_url(url: str) -> str:
    """
    Opens a URL in the user's default desktop web browser (e.g. Chrome, Edge, Brave, Firefox).
    Args:
        url: The web URL to open.
    """
    try:
        clean_url = url.strip()
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = f"https://{clean_url}"
        webbrowser.open(clean_url)
        return json.dumps({
            "success": True,
            "tool": "open_browser_url",
            "data": {"url": clean_url, "status": "opened_in_default_browser"},
            "error": None,
            "metadata": {}
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "open_browser_url",
            "data": None,
            "error": {"code": "BROWSER_OPEN_FAILED", "message": str(e)},
            "metadata": {"url": url}
        }, indent=2)

@tool
def open_visible_browser(url: str, search_query: Optional[str] = None, wait_seconds: int = 8) -> str:
    """
    Launches a REAL VISIBLE desktop browser window (driving your installed Chrome/Edge or Playwright Chromium)
    where the user can watch page loading, search queries, and content live on screen.
    Includes CAPTCHA awareness.
    Args:
        url: The web URL to navigate to.
        search_query: Optional query for the agent to visibly type into search input.
        wait_seconds: Number of seconds to keep the visible window open for the user.
    """
    clean_url = url.strip()
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = f"https://{clean_url}"

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, launch_mode = _launch_best_chromium(p, headless=False)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            page.goto(clean_url, timeout=25000, wait_until="domcontentloaded")
            title = page.title()
            content = page.inner_text("body")[:5000]

            is_captcha, captcha_type = check_for_captcha(content, title)
            if is_captcha:
                print(f"[VisibleBrowser] CAPTCHA detected ({captcha_type}). Waiting for user...")
                for _ in range(15):
                    time.sleep(1)
                    title = page.title()
                    content = page.inner_text("body")[:5000]
                    is_c, _ = check_for_captcha(content, title)
                    if not is_c and len(content) > 300:
                        break

            if search_query and not is_captcha:
                try:
                    search_input = page.locator('input[name="q"], input[type="search"], textarea[name="q"], input[placeholder*="Search" i]').first
                    if search_input.count() > 0:
                        search_input.click()
                        search_input.type(search_query, delay=70)
                        search_input.press("Enter")
                        page.wait_for_load_state("domcontentloaded", timeout=10000)
                        title = page.title()
                        content = page.inner_text("body")[:5000]
                except Exception as ex:
                    print(f"[VisibleBrowser] Typing notice: {ex}")

            time.sleep(max(2, min(wait_seconds, 15)))
            final_content = page.inner_text("body")[:5000]
            final_title = page.title()
            browser.close()

            return json.dumps({
                "success": True,
                "tool": "open_visible_browser",
                "data": {
                    "url": clean_url,
                    "title": final_title,
                    "visible_mode": launch_mode,
                    "captcha_encountered": is_captcha,
                    "content_preview": final_content[:1200],
                    "character_count": len(final_content)
                },
                "error": None,
                "metadata": {"search_query": search_query}
            }, indent=2)

    except Exception as e:
        # Fallback to default desktop browser with properly URL-encoded query
        try:
            target_url = clean_url
            if search_query:
                encoded_q = urllib.parse.quote_plus(search_query)
                if "google.com" in clean_url or "duckduckgo.com" in clean_url or "bing.com" in clean_url:
                    target_url = f"{clean_url.rstrip('/')}/?q={encoded_q}"
                else:
                    target_url = f"{clean_url}?q={encoded_q}"
            webbrowser.open(target_url)
            return json.dumps({
                "success": True,
                "tool": "open_visible_browser",
                "data": {
                    "url": target_url,
                    "title": "Opened in Default Browser (URL Encoded Fallback)",
                    "status": "visible_browser_window_opened"
                },
                "error": None,
                "metadata": {"mode": "desktop_browser_fallback", "notice": str(e)}
            }, indent=2)
        except Exception as fallback_err:
            return json.dumps({
                "success": False,
                "tool": "open_visible_browser",
                "data": None,
                "error": {"code": "VISIBLE_BROWSER_FAILED", "message": f"Playwright: {str(e)}; Fallback: {str(fallback_err)}"},
                "metadata": {"url": clean_url}
            }, indent=2)

@tool
def browser_navigate(url: str, visible: bool = False, max_chars: int = 8000) -> str:
    """
    Navigates to a URL to extract page title and text content.
    Args:
        url: The web URL to fetch and read.
        visible: If True, opens a visible browser window.
        max_chars: Maximum characters of page text to extract.
    """
    clean_url = url.strip()
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = f"https://{clean_url}"

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, launch_mode = _launch_best_chromium(p, headless=not visible)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            page.goto(clean_url, timeout=20000, wait_until="domcontentloaded")
            title = page.title()
            content = page.inner_text("body")[:max_chars]

            is_captcha, captcha_type = check_for_captcha(content, title)
            if is_captcha and visible:
                time.sleep(10)
                title = page.title()
                content = page.inner_text("body")[:max_chars]
                is_captcha, _ = check_for_captcha(content, title)

            browser.close()
            return json.dumps({
                "success": True,
                "tool": "browser_navigate",
                "data": {
                    "url": clean_url,
                    "title": title,
                    "content": content if not is_captcha else f"[Note: Page presented challenge: {captcha_type}. Preview: {content[:300]}]",
                    "captcha_detected": is_captcha,
                    "character_count": len(content),
                    "visible": visible,
                    "engine": launch_mode
                },
                "error": None
            }, indent=2)

    except Exception as e:
        # Fallback to realistic HTTP user-agent fetch
        try:
            req = urllib.request.Request(
                clean_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read().decode('utf-8', errors='ignore')
                import re
                text = re.sub(r'<[^>]+>', ' ', html)
                text = re.sub(r'\s+', ' ', text).strip()[:max_chars]
                is_captcha, _ = check_for_captcha(text, "")
                return json.dumps({
                    "success": True,
                    "tool": "browser_navigate",
                    "data": {
                        "url": clean_url,
                        "title": "Extracted via HTTP Fallback",
                        "content": text,
                        "captcha_detected": is_captcha,
                        "character_count": len(text)
                    },
                    "error": None,
                    "metadata": {"mode": "http_fallback"}
                }, indent=2)
        except Exception as fallback_err:
            return json.dumps({
                "success": False,
                "tool": "browser_navigate",
                "data": None,
                "error": {
                    "code": "NAVIGATION_FAILED",
                    "message": f"Playwright error: {str(e)}; HTTP fallback error: {str(fallback_err)}"
                },
                "metadata": {"url": clean_url}
            }, indent=2)

@tool
def browser_click(selector: str, url: Optional[str] = None) -> str:
    """
    Clicks an element on a web page matching a CSS selector or text description.
    Args:
        selector: CSS selector or text selector (e.g. 'button.submit', 'text=Sign In', 'a.read-more').
        url: URL to navigate to first if browser is not currently open.
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, _ = _launch_best_chromium(p, headless=True)
            page = browser.new_page()
            if url:
                page.goto(url, timeout=15000, wait_until="domcontentloaded")
            target = page.locator(selector).first
            target.click(timeout=5000)
            page.wait_for_load_state("domcontentloaded", timeout=5000)
            new_title = page.title()
            new_url = page.url
            browser.close()
            return json.dumps({
                "success": True,
                "tool": "browser_click",
                "data": {"selector": selector, "new_url": new_url, "title": new_title}
            }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "browser_click",
            "error": {"code": "CLICK_FAILED", "message": str(e)}
        }, indent=2)

@tool
def browser_type(selector: str, text: str, press_enter: bool = True, url: Optional[str] = None) -> str:
    """
    Types text into an input field or textarea on a web page.
    Args:
        selector: CSS selector for the input field.
        text: The string to type.
        press_enter: Whether to press Enter after typing.
        url: URL to navigate to first if needed.
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, _ = _launch_best_chromium(p, headless=True)
            page = browser.new_page()
            if url:
                page.goto(url, timeout=15000, wait_until="domcontentloaded")
            target = page.locator(selector).first
            target.click()
            target.fill(text)
            if press_enter:
                target.press("Enter")
                page.wait_for_load_state("domcontentloaded", timeout=5000)
            new_title = page.title()
            browser.close()
            return json.dumps({
                "success": True,
                "tool": "browser_type",
                "data": {"selector": selector, "typed": text, "title": new_title}
            }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "browser_type",
            "error": {"code": "TYPE_FAILED", "message": str(e)}
        }, indent=2)

@tool
def browser_scroll(direction: str = "down", amount: int = 500, url: Optional[str] = None) -> str:
    """
    Scrolls the active browser page up or down.
    Args:
        direction: 'down' or 'up'.
        amount: Pixels to scroll (default 500).
        url: URL to open if not already open.
    """
    delta = amount if direction.lower() == "down" else -amount
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, _ = _launch_best_chromium(p, headless=True)
            page = browser.new_page()
            if url:
                page.goto(url, timeout=15000, wait_until="domcontentloaded")
            page.mouse.wheel(0, delta)
            time.sleep(0.5)
            content = page.inner_text("body")[:3000]
            browser.close()
            return json.dumps({
                "success": True,
                "tool": "browser_scroll",
                "data": {"direction": direction, "amount": amount, "content_preview": content[:500]}
            }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "browser_scroll",
            "error": {"code": "SCROLL_FAILED", "message": str(e)}
        }, indent=2)

@tool
def browser_screenshot(url: str, filename: Optional[str] = None) -> str:
    """
    Takes a visual screenshot of a web page and saves it locally.
    Args:
        url: The web URL to screenshot.
        filename: Optional filename for the screenshot.
    """
    clean_url = url.strip()
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = f"https://{clean_url}"

    out_name = filename or f"screenshot_{int(time.time())}.png"
    if not out_name.endswith(".png"):
        out_name += ".png"
    out_path = SCREENSHOTS_DIR / out_name

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser, _ = _launch_best_chromium(p, headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(clean_url, timeout=20000, wait_until="domcontentloaded")
            page.screenshot(path=str(out_path), full_page=False)
            title = page.title()
            browser.close()

            return json.dumps({
                "success": True,
                "tool": "browser_screenshot",
                "data": {
                    "url": clean_url,
                    "title": title,
                    "screenshot_path": str(out_path),
                    "filename": out_name
                },
                "error": None
            }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "browser_screenshot",
            "data": None,
            "error": {"code": "SCREENSHOT_FAILED", "message": str(e)},
            "metadata": {"url": clean_url}
        }, indent=2)
