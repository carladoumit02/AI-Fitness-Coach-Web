"""Evaluate cached movement sequences, grouping every clip of a person together."""
from pathlib import Path
import argparse
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


def summarize(sequence):
    # Each row represents a normalized instant within the exercise video.
    blocks = np.array_split(sequence, 4)
    return np.concatenate([np.nanpercentile(block, [10, 50, 90], axis=0).ravel()
                           for block in blocks])


def evaluate(manifest, sequences, output, by_view=False):
    output.mkdir(parents=True, exist_ok=True)
    data = pd.read_csv(manifest)
    cache = joblib.load(sequences)
    if data.path.duplicated().any():
        raise ValueError('Duplicate video identifiers in manifest')
    data[~data.path.isin(cache)].to_csv(output / 'missing_sequences.csv', index=False)
    data = data[data.path.isin(cache)].copy()
    results = {}
    groups = ['exercise', 'view'] if by_view else 'exercise'
    for key, rows in data.groupby(groups):
        exercise = '_'.join(key) if isinstance(key, tuple) else key
        X = np.stack([summarize(cache[path]) for path in rows.path])
        X[~np.isfinite(X)] = np.nan
        y = rows.quality.to_numpy()
        predictions = np.empty(len(y), dtype=object)
        model = make_pipeline(SimpleImputer(strategy='median'), StandardScaler(),
                              SVC(C=1, kernel='rbf', gamma='scale'))
        for train, test in LeaveOneGroupOut().split(X, y, rows.subject):
            model.fit(X[train], y[train])
            predictions[test] = model.predict(X[test])
        rows.assign(prediction=predictions).to_csv(output / f'{exercise}_predictions.csv', index=False)
        results[exercise] = dict(videos=len(y), participants=int(rows.subject.nunique()),
            accuracy=accuracy_score(y, predictions), report=classification_report(y, predictions, output_dict=True),
            matrix_bad_good=confusion_matrix(y, predictions, labels=['bad','good']).tolist())
        joblib.dump(model.fit(X,y), output / f'{exercise}_pipeline.joblib')
    (output / 'grouped_metrics.json').write_text(json.dumps(results, indent=2))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('manifest','sequences','output'):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.manifest, args.sequences, args.output), indent=2))
