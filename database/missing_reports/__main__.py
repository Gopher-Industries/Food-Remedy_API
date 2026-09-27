"""Authenticated, bounded staging command. JSON output contains no identities."""
import argparse
import json
import os
import sys

from .api import create_app, verify_token
from .workflow import Error, authenticated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--stage', nargs='+', metavar='SUBMISSION_ID')
    group.add_argument('--batch', help='Recover a previously committed batch')
    args = parser.parse_args()
    try:
        actor = verify_token(os.environ['MISSING_REPORT_REVIEWER_TOKEN'])
        authenticated(actor, True)
        store = create_app().store
        result = store.stage(actor, args.stage) if args.stage else store.read_batch(actor, args.batch)
    except Error as error:
        print(error.code, file=sys.stderr)
        return 1
    except Exception:
        print('Staging failed; verify credentials and service configuration.', file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
