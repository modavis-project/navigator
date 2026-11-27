from navigator_app.coupler_terms import coupler_wording


def test_direction_and_interval_come_from_the_recorded_labels():
    result = coupler_wording("Swell suboctave to Great")
    assert (result['soundingDivision'], result['playingDivision']) == ('Swell', 'Great')
    assert result['intervalSemitones'] == -12
    assert result['vocabularyHref'].endswith('/sub-octave')
    unison = coupler_wording("Great to Pedal 8′")
    assert unison['intervalSemitones'] == 0 and unison['nominalFeet'] == [8]


def test_unordered_and_underspecified_wordings_do_not_acquire_false_fields():
    assert coupler_wording('Pedal - Hauptwerk') is None
    direction = coupler_wording('Great to Pedal')
    assert 'intervalSemitones' not in direction and 'couplerType' not in direction
    combination = coupler_wording("Swell to Great 16', 8', 4'")
    assert combination['nominalFeet'] == [16, 8, 4] and 'couplerType' not in combination
    assert 'playingDivision' not in coupler_wording('Swell octave')
    assert 'intervalSemitones' not in coupler_wording('Swell unison off')
    assert 'couplerType' not in coupler_wording("Swell octave to Great 16'")
