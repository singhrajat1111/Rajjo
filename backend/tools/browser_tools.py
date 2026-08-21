import os
import json
import time
import webbrowser
from pathlib import Path
from typing import Optional, Tuple
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


@tool
def open_browser_url(url: str) -> str:
    """
    Opens a URL in the user's default desktop web browser (e.g. Chrome, Edge, Brave, Firefox).
    Args:
        url: The web URL to open (e.g. https://www.google.com).
    """
    try:
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        webbrowser.open(url)
        return json.dumps({
            "success": True,
            "tool": "open_browser_url",
            "data": {"url": url, "status": "opened_in_default_browser"},
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
    Launches a REAL VISIBLE desktop browser window where the user can watch the agent load the page,
    type a search query, scroll, and extract content in real-time.
    Includes CAPTCHA awareness: if a Cloudflare / Human verification screen appears, the window stays open
    allowing human assistance without aborting.
    Args:
        url: The web URL to navigate to.
        search_query: Optional query for the agent to visibly type into the search box.
        wait_seconds: Number of seconds to keep the visible window open for the user to view.
    """
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            # Launch in HEADFUL (visible) mode so user sees the live window
            browser = p.chromium.launch(
                headless=False,
                slow_mo=80,
                args=["--disable-blink-features=AutomationControlled"]
            )
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            page.goto(url, timeout=25000, wait_until="domcontentloaded")
            title = page.title()
            content = page.inner_text("body")[:5000]

            # Check if CAPTCHA challenge is active
            is_captcha, captcha_type = check_for_captcha(content, title)
            if is_captcha:
                print(f"[VisibleBrowser] CAPTCHA challenge detected ({captcha_type}). Waiting for human resolution...")
                # Allow user 15 seconds to solve captcha on screen
                for _ in range(15):
                    time.sleep(1)
                    title = page.title()
                    content = page.inner_text("body")[:5000]
                    is_captcha_now, _ = check_for_captcha(content, title)
                    if not is_captcha_now and len(content) > 300:
                        break
            
            # If search query provided, visibly type it
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
                    print(f"[VisibleBrowser] Typing simulation notice: {ex}")

            time.sleep(max(2, min(wait_seconds, 15)))
            
            final_content = page.inner_text("body")[:5000]
            final_title = page.title()
            browser.close()

            return json.dumps({
                "success": True,
                "tool": "open_visible_browser",
                "data": {
                    "url": url,
                    "title": final_title,
                    "visible_mode": "headful_window_displayed",
                    "captcha_encountered": is_captcha,
                    "content_preview": final_content[:1200],
                    "character_count": len(final_content)
                },
                "error": None,
                "metadata": {"search_query": search_query}
            }, indent=2)

    except Exception as e:
        # Fallback to default desktop browser if Playwright headful isn't available
        try:
            target_url = url
            if search_query and ("google.com" in url or "duckduckgo.com" in url):
                target_url = f"{url}?q={search_query}"
            webbrowser.open(target_url)
            return json.dumps({
                "success": True,
                "tool": "open_visible_browser",
                "data": {
                    "url": target_url,
                    "title": "Opened in Default Browser (Fallback)",
                    "status": "visible_browser_window_opened"
                },
                "error": None,
                "metadata": {"mode": "desktop_browser_fallback", "error": str(e)}
            }, indent=2)
        except Exception as fallback_err:
            return json.dumps({
                "success": False,
                "tool": "open_visible_browser",
                "data": None,
                "error": {"code": "VISIBLE_BROWSER_FAILED", "message": f"Playwright error: {str(e)}; Fallback: {str(fallback_err)}"},
                "metadata": {"url": url}
            }, indent=2)


@tool
def browser_navigate(url: str, visible: bool = False, max_chars: int = 8000) -> str:
    """
    Navigates to a URL to extract page title and text content.
    Includes CAPTCHA and Cloudflare bot challenge awareness with automatic fallback.
    Args:
        url: The web URL to fetch and read.
        visible: If True, opens a visible browser window so the user sees the page loading.
        max_chars: Maximum characters of page text to extract.
    """
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=not visible,
                args=["--disable-blink-features=AutomationControlled"]
            )
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            
            title = page.title()
            content = page.inner_text("body")[:max_chars]
            
            is_captcha, captcha_type = check_for_captcha(content, title)
            if is_captcha and visible:
                # Wait up to 10 seconds in visible window for user to solve
                time.sleep(10)
                title = page.title()
                content = page.inner_text("body")[:max_chars]
                is_captcha, _ = check_for_captcha(content, title)

            browser.close()

            return json.dumps({
                "success": True,
                "tool": "browser_navigate",
                "data": {
                    "url": url,
                    "title": title,
                    "content": content if not is_captcha else f"[Note: Page presented a verification screen: {captcha_type}. Content preview: {content[:300]}]",
                    "captcha_detected": is_captcha,
                    "character_count": len(content),
                    "visible": visible
                },
                "error": None,
                "metadata": {"captcha_type": captcha_type if is_captcha else None}
            }, indent=2)

    except Exception as e:
        # Fallback to requests/urllib with realistic human headers
        try:
            import urllib.request
            req = urllib.request.Request(
                url,
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
                        "url": url,
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
                "metadata": {"url": url}
            }, indent=2)


@tool
def browser_screenshot(url: str, filename: Optional[str] = None) -> str:
    """
    Takes a visual screenshot of a web page and saves it locally.
    Args:
        url: The web URL to screenshot.
        filename: Optional filename for the screenshot (e.g. page.png).
    """
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"

    out_name = filename or f"screenshot_{int(time.time())}.png"
    if not out_name.endswith(".png"):
        out_name += ".png"
    out_path = SCREENSHOTS_DIR / out_name

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.screenshot(path=str(out_path), full_page=False)
            title = page.title()
            browser.close()

            return json.dumps({
                "success": True,
                "tool": "browser_screenshot",
                "data": {
                    "url": url,
                    "title": title,
                    "screenshot_path": str(out_path),
                    "filename": out_name
                },
                "error": None,
                "metadata": {}
            }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "tool": "browser_screenshot",
            "data": None,
            "error": {"code": "SCREENSHOT_FAILED", "message": str(e)},
            "metadata": {"url": url}
        }, indent=2)
