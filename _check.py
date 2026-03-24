with open('main.js', encoding='utf-8') as f:
    c = f.read()

checks = [
    "let _knownDiscovered = null",
    "const _discoveryQueue = []",
    "function _queueDiscovery(ckey)",
    "function _showNextDiscovery()",
    "function _showDiscoveryPopup(",
    "_queueDiscovery(_ck)",
    "discovery-popup",
    "discovery-timer-fill",
    "const showHistory",
    "key: 'history'",
    "if (showHistory)",
    "discovery-history-list",
    "engine.creatureDiscoveryLog",
]
for ch in checks:
    print("OK  " if ch in c else "MISS", repr(ch))
