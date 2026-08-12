# /// script
# dependencies = ["fastmcp"]
# ///
from pathlib import Path

from fastmcp import FastMCP

LOREM_IPSUM_PATH = Path(__file__).parent / "lorem-ipsum.md"
DEFAULT_WORD_COUNT = 30

mcp = FastMCP("lorem-ipsum-server")


def _read_words(word_count: int = DEFAULT_WORD_COUNT) -> str:
    text = LOREM_IPSUM_PATH.read_text()
    words = text.split()
    return " ".join(words[:word_count])


@mcp.resource("lorem-ipsum://{word_count}")
def lorem_ipsum_resource(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Return the first `word_count` words of lorem-ipsum.md."""
    return _read_words(word_count)


@mcp.tool
def read(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Read the first `word_count` words from lorem-ipsum.md (default 30)."""
    return _read_words(word_count)


if __name__ == "__main__":
    mcp.run()
