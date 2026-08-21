import json
import warnings
import urllib.request
import urllib.parse
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool

# Suppress runtime warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", message=".*renamed to.*")

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None


def _fallback_wikipedia_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """Free public encyclopedia API fallback that never requires CAPTCHAs."""
    try:
        url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote(query)}&limit={max_results}&namespace=0&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "RajjoAgent/1.0 (Desktop AI Assistant)"})
        with urllib.request.urlopen(req, timeout=6) as response:
            data = json.loads(response.read().decode("utf-8"))
            titles = data[1] if len(data) > 1 else []
            snippets = data[2] if len(data) > 2 else []
            links = data[3] if len(data) > 3 else []
            results = []
            for i in range(len(titles)):
                results.append({
                    "title": titles[i],
                    "snippet": snippets[i] or f"Wikipedia article on {titles[i]}",
                    "url": links[i] if i < len(links) else f"https://en.wikipedia.org/wiki/{urllib.parse.quote(titles[i])}"
                })
            return results
    except Exception:
        return []


def _fallback_html_search(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Direct HTTP fallback for web searches with human user-agent."""
    try:
        import re
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9"
            }
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
            results = []
            link_pattern = re.compile(r'<a[^>]+class="result__url"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE)
            snippet_pattern = re.compile(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', re.IGNORECASE)
            
            urls = link_pattern.findall(html)
            snippets = snippet_pattern.findall(html)
            
            for i in range(min(max_results, len(urls))):
                raw_url, title = urls[i]
                clean_title = re.sub(r'<[^>]+>', '', title).strip()
                clean_snippet = re.sub(r'<[^>]+>', '', snippets[i]).strip() if i < len(snippets) else ""
                
                actual_url = raw_url
                if "uddg=" in raw_url:
                    m = re.search(r'uddg=([^&]+)', raw_url)
                    if m:
                        actual_url = urllib.parse.unquote(m.group(1))
                
                if actual_url and clean_title:
                    results.append({
                        "title": clean_title,
                        "snippet": clean_snippet,
                        "url": actual_url
                    })
            return results
    except Exception:
        return []


@tool
def web_search(query: str, max_results: int = 5) -> str:
    """
    Searches the live web using multi-engine resilience (DuckDuckGo, direct HTTP, and public knowledge APIs).
    Handles rate-limits and CAPTCHAs automatically with failover.
    Args:
        query: Search query keywords or question.
        max_results: Number of search results to return (default: 5).
    """
    results = []
    engine_used = "ddgs"

    # 1. Primary: DDGS library
    if DDGS is not None:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                ddgs_instance = DDGS()
                raw_results = list(ddgs_instance.text(query, max_results=max_results))
                for item in raw_results:
                    results.append({
                        "title": item.get("title", ""),
                        "snippet": item.get("body", ""),
                        "url": item.get("href", "")
                    })
        except Exception:
            pass

    # 2. Secondary: Direct HTML Fallback if primary returned nothing or hit rate-limits/captchas
    if not results:
        results = _fallback_html_search(query, max_results=max_results)
        if results:
            engine_used = "html_direct"

    # 3. Tertiary: Public Wikipedia API Fallback
    if not results:
        results = _fallback_wikipedia_search(query, max_results=max_results)
        if results:
            engine_used = "wikipedia_api"

    if results:
        return json.dumps({
            "success": True,
            "tool": "web_search",
            "data": {
                "results": results,
                "count": len(results),
                "engine": engine_used
            },
            "error": None,
            "metadata": {"query": query}
        }, indent=2)
    else:
        return json.dumps({
            "success": False,
            "tool": "web_search",
            "data": None,
            "error": {
                "code": "SEARCH_RATE_LIMITED_OR_BLOCKED",
                "message": f"Web search endpoints are temporarily saturated or bot-challenged for '{query}'. Try asking the agent to use 'open_visible_browser' or search with specific alternative keywords."
            },
            "metadata": {"query": query}
        }, indent=2)
