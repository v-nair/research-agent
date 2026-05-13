import re
import requests
from html.parser import HTMLParser

import wikipedia
from langchain_core.tools import tool


@tool
def search_wikipedia(query: str) -> str:
    """Search Wikipedia for information about a person, place, event, or concept. Returns a summary."""
    try:
        results = wikipedia.search(query, results=3)
        if not results:
            return f"No Wikipedia results found for '{query}'"
        page = wikipedia.page(results[0], auto_suggest=False)
        return f"**{page.title}**\n\n{page.summary[:2000]}"
    except wikipedia.exceptions.DisambiguationError as e:
        try:
            page = wikipedia.page(e.options[0], auto_suggest=False)
            return f"**{page.title}**\n\n{page.summary[:2000]}"
        except Exception:
            return f"Ambiguous query. Try one of: {', '.join(e.options[:5])}"
    except Exception as e:
        return f"Wikipedia error: {e}"


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip = False
        self._skip_tags = {"script", "style", "head", "nav", "footer", "noscript"}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag.lower() in self._skip_tags:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self._skip_tags:
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip and data.strip():
            self._parts.append(data.strip())

    def get_text(self) -> str:
        return " ".join(self._parts)


@tool
def fetch_webpage(url: str) -> str:
    """Fetch and extract readable text from a public webpage URL."""
    try:
        response = requests.get(
            url,
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchAgent/1.0)"},
        )
        response.raise_for_status()
        extractor = _TextExtractor()
        extractor.feed(response.text)
        text = extractor.get_text()
        text = re.sub(r"\s{2,}", " ", text).strip()
        return text[:2000] if text else "No readable content found."
    except requests.exceptions.Timeout:
        return "Request timed out."
    except requests.exceptions.RequestException as e:
        return f"Failed to fetch webpage: {e}"
