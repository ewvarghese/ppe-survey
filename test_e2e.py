"""Test Flask mode using an isolated temporary database, not surveys.db."""
from test_short_form import run
if __name__ == '__main__':
    run('server')
