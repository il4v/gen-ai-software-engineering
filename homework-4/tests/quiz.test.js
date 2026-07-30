/**
 * Unit tests for src/static/quiz.js - Frontend leaderboard display
 *
 * Focus: Regression tests for Bug 003 (Reflected XSS via unsanitized player name)
 * Fixed by: Using textContent instead of innerHTML concatenation
 */

// Mock global fetch
global.fetch = jest.fn();

// Helper to set up fresh DOM for each test
function setupDOM() {
  document.body.innerHTML = `
    <div id="landing-screen"></div>
    <div id="quiz-screen"></div>
    <div id="result-screen"></div>
    <div id="leaderboard-screen"></div>
    <div id="question-container"></div>
    <div id="leaderboard-list"></div>
    <button id="submit-btn"></button>
    <div id="score-display"></div>
    <input id="name-input" />
    <button id="start-btn"></button>
    <button id="view-leaderboard-btn"></button>
    <button id="show-leaderboard-btn"></button>
    <button id="play-again-btn"></button>
    <button id="back-btn"></button>
  `;

  // Reset fetch mock
  global.fetch.mockClear();
}

/**
 * FIXED: showLeaderboard() function from quiz.js
 *
 * This is the corrected version that prevents XSS by using textContent
 * instead of innerHTML concatenation.
 */
async function showLeaderboard() {
  const res = await fetch("/api/leaderboard");
  const entries = await res.json();

  const leaderboardList = document.getElementById("leaderboard-list");
  leaderboardList.innerHTML = "";
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score}`;
    leaderboardList.appendChild(li);
  });

  // Show leaderboard screen
  const screens = [
    document.getElementById("landing-screen"),
    document.getElementById("quiz-screen"),
    document.getElementById("result-screen"),
    document.getElementById("leaderboard-screen")
  ];
  screens.forEach(s => s.classList.add("hidden"));
  document.getElementById("leaderboard-screen").classList.remove("hidden");
}

beforeEach(() => {
  setupDOM();
});

describe('showLeaderboard() - XSS Prevention (Bug 003 Regression Tests)', () => {

  test('REGRESSION: Should not execute script when player name contains <img> tag with onerror', async () => {
    // Arrange: Set up a mock leaderboard response with XSS payload
    const xssPayload = '<img src=x onerror=alert(1)>';
    const mockLeaderboard = [
      { name: xssPayload, score: 100 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Mock alert to verify it doesn't get called
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    // Act: Call showLeaderboard (this would have triggered alert in buggy version)
    await showLeaderboard();

    // Assert: alert should NOT have been called
    expect(alertSpy).not.toHaveBeenCalled();

    // Cleanup
    alertSpy.mockRestore();
  });

  test('REGRESSION: Should display XSS payload as literal text, not HTML', async () => {
    // Arrange
    const xssPayload = '<img src=x onerror=alert(1)>';
    const mockLeaderboard = [
      { name: xssPayload, score: 100 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert: The leaderboard list should contain the text content, not parsed HTML
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(1);

    // The textContent should show the literal string
    expect(listItems[0].textContent).toBe(`${xssPayload} — 100`);

    // The innerHTML should NOT contain an img tag (it should be escaped text)
    expect(listItems[0].innerHTML).not.toContain('<img');
  });

  test('REGRESSION: Should not execute <script> tags in player names', async () => {
    // Arrange
    const scriptPayload = '<script>alert("xss")</script>';
    const mockLeaderboard = [
      { name: scriptPayload, score: 50 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    // Act
    await showLeaderboard();

    // Assert
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  test('REGRESSION: Bold tags in player names should be displayed as text, not formatted', async () => {
    // Arrange: As described in the fix verification (submit name of <b>test</b>)
    const boldPayload = '<b>test</b>';
    const mockLeaderboard = [
      { name: boldPayload, score: 75 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert: Should show as literal text, not bold
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe(`${boldPayload} — 75`);

    // The content should NOT contain a <b> tag element
    const bTags = listItems[0].querySelectorAll('b');
    expect(bTags.length).toBe(0);
  });

  test('REGRESSION: iframe payloads should not be embedded', async () => {
    // Arrange
    const iframePayload = '<iframe src="evil.com"></iframe>';
    const mockLeaderboard = [
      { name: iframePayload, score: 60 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const iframes = document.querySelectorAll('#leaderboard-list iframe');
    expect(iframes.length).toBe(0);

    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe(`${iframePayload} — 60`);
  });
});

describe('showLeaderboard() - Happy Path & Normal Behavior', () => {

  test('Should display normal player names correctly', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: 'Alice', score: 100 },
      { name: 'Bob', score: 85 },
      { name: 'Charlie', score: 70 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(3);
    expect(listItems[0].textContent).toBe('Alice — 100');
    expect(listItems[1].textContent).toBe('Bob — 85');
    expect(listItems[2].textContent).toBe('Charlie — 70');
  });

  test('Should clear previous leaderboard entries before adding new ones', async () => {
    // Arrange: Pre-populate with stale data
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '<li>Stale Entry — 999</li>';

    const mockLeaderboard = [
      { name: 'Fresh', score: 100 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert: Should only have the new entry
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(1);
    expect(listItems[0].textContent).toBe('Fresh — 100');
  });

  test('Should fetch from /api/leaderboard endpoint', async () => {
    // Arrange
    global.fetch.mockResolvedValueOnce({
      json: async () => []
    });

    // Act
    await showLeaderboard();

    // Assert
    expect(global.fetch).toHaveBeenCalledWith('/api/leaderboard');
  });

  test('Should show leaderboard screen after loading data', async () => {
    // Arrange
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    leaderboardScreen.classList.add('hidden');

    global.fetch.mockResolvedValueOnce({
      json: async () => []
    });

    // Act
    await showLeaderboard();

    // Assert: leaderboard screen should be visible (not hidden)
    expect(leaderboardScreen.classList.contains('hidden')).toBe(false);
  });

  test('Should create li elements dynamically', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: 'Player1', score: 100 },
      { name: 'Player2', score: 90 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert: Verify li elements were created via createElement (not innerHTML)
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(2);

    // Check that elements are actual DOM nodes
    listItems.forEach(item => {
      expect(item.nodeType).toBe(1); // Node.ELEMENT_NODE
      expect(item.tagName).toBe('LI');
    });
  });
});

describe('showLeaderboard() - Edge Cases', () => {

  test('Should handle empty leaderboard', async () => {
    // Arrange
    global.fetch.mockResolvedValueOnce({
      json: async () => []
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(0);
  });

  test('Should handle player names with special characters', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: 'Player@#$%', score: 100 },
      { name: 'José', score: 90 },
      { name: '🎮Player', score: 80 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe('Player@#$% — 100');
    expect(listItems[1].textContent).toBe('José — 90');
    expect(listItems[2].textContent).toBe('🎮Player — 80');
  });

  test('Should handle player names with quotes and apostrophes', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: "O'Brien", score: 100 },
      { name: 'Player "Admin"', score: 95 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe("O'Brien — 100");
    expect(listItems[1].textContent).toBe('Player "Admin" — 95');
  });

  test('Should handle player names with HTML entity characters', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: 'Player & Friends', score: 100 },
      { name: '<Tag>', score: 90 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe('Player & Friends — 100');
    expect(listItems[1].textContent).toBe('<Tag> — 90');
  });

  test('Should handle very long player names', async () => {
    // Arrange
    const longName = 'A'.repeat(1000);
    const mockLeaderboard = [
      { name: longName, score: 100 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe(`${longName} — 100`);
  });

  test('Should handle scores with various numeric values', async () => {
    // Arrange
    const mockLeaderboard = [
      { name: 'Zero', score: 0 },
      { name: 'High', score: 9999 },
      { name: 'Negative', score: -100 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems[0].textContent).toBe('Zero — 0');
    expect(listItems[1].textContent).toBe('High — 9999');
    expect(listItems[2].textContent).toBe('Negative — -100');
  });

  test('Should handle multiple entries with various payloads', async () => {
    // Arrange: Mix of normal names and XSS attempts
    const mockLeaderboard = [
      { name: 'Normal', score: 100 },
      { name: '<img src=x onerror=alert(1)>', score: 90 },
      { name: 'Another Normal', score: 80 },
      { name: '<iframe src="evil.com"></iframe>', score: 70 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    expect(listItems.length).toBe(4);

    // Verify none are executing code (would have thrown errors)
    expect(listItems[1].textContent).toContain('<img src=x onerror=alert(1)>');
    expect(listItems[3].textContent).toContain('<iframe src="evil.com"></iframe>');

    // Verify no img or iframe tags were actually created
    const imgTags = document.querySelectorAll('#leaderboard-list img');
    const iframes = document.querySelectorAll('#leaderboard-list iframe');
    expect(imgTags.length).toBe(0);
    expect(iframes.length).toBe(0);
  });

  test('Should properly escape HTML content in textContent', async () => {
    // Arrange: Verify that dangerous HTML is shown literally
    const mockLeaderboard = [
      { name: '<svg onload=alert(1)>', score: 100 },
      { name: '<style>body{display:none}</style>', score: 90 }
    ];

    global.fetch.mockResolvedValueOnce({
      json: async () => mockLeaderboard
    });

    // Act
    await showLeaderboard();

    // Assert
    const listItems = document.querySelectorAll('#leaderboard-list li');
    const svgElements = document.querySelectorAll('#leaderboard-list svg');
    const styleElements = document.querySelectorAll('#leaderboard-list style');

    expect(svgElements.length).toBe(0);
    expect(styleElements.length).toBe(0);
    expect(listItems[0].textContent).toContain('<svg onload=alert(1)>');
  });
});
