"""Test live GitHub Pages in a disposable browser; no server records are changed."""
import os
from test_short_form import run
if __name__ == '__main__':
    run('static', os.environ.get('SURVEY_URL', 'https://ewvarghese.github.io/ppe-survey/'))
