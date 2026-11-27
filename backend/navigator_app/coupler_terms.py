"""Parse explicit labels in the public coupler wording field.

The result is a reading of the label, not an assertion about the physical
disposition. The connector and division names are deliberately bounded to
documented English stop-list conventions.
"""
import re

_DIVISION = r'Great|Swell|Choir|Pedal|Solo|Positive|Positiv|Echo|Bombarde|Antiphonal'
_OCTAVE = r'sub[ -]?octave|super[ -]?octave|octave|unison off|unison'
_PITCH = r"(?:16|8|4)[′'’]"
_PITCH_LIST = rf'{_PITCH}(?:\s*,\s*{_PITCH})*'
_COUPLER = re.compile(
    rf'(?P<sounding>{_DIVISION})(?: (?P<function>{_OCTAVE}))?'
    rf'(?: to (?P<playing>{_DIVISION}))?'
    rf'(?: (?P<feet>{_PITCH_LIST}))?', re.IGNORECASE,
)
_FUNCTIONS = {
    'suboctave': ('sub-octave', -12),
    'superoctave': ('super-octave', 12),
    'octave': ('super-octave', 12),
    'unison': ('unison', 0),
    'unisonoff': ('unison-off', None),
}
_FOOT_TYPES = {16: _FUNCTIONS['suboctave'], 8: _FUNCTIONS['unison'], 4: _FUNCTIONS['octave']}
_TERM_URL = '/vocab/organ-specifications/couplers/'


def coupler_wording(raw):
    match = _COUPLER.fullmatch(' '.join(raw.split()))
    if match is None:
        return None
    label = match.groupdict()
    if not any(label[key] for key in ('function', 'playing', 'feet')):
        return None
    result = {'basis': 'recorded_wording'}
    if label['playing']:
        result.update(soundingDivision=label['sounding'], playingDivision=label['playing'])
    else:
        result['namedDivision'] = label['sounding']
    feet = [int(value) for value in re.findall(r'\d+', label['feet'] or '')]
    function = re.sub(r'[ -]+', '', (label['function'] or '').lower())
    from_word = _FUNCTIONS.get(function)
    from_pitch = _FOOT_TYPES[feet[0]] if len(feet) == 1 else None
    if len(feet) > 1 or (from_word and from_pitch and from_word != from_pitch):
        result['nominalFeet'] = feet
        return result
    if feet:
        result['nominalFeet'] = feet
    type_and_interval = from_word or from_pitch
    if type_and_interval:
        key, semitones = type_and_interval
        result.update(couplerType=key, vocabularyHref=_TERM_URL + key)
        if semitones is not None:
            result['intervalSemitones'] = semitones
    return result
