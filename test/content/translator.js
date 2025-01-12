import {STRING_DOES_NOT_EXIST_MSG, STRING_ERROR_MSG} from '../helpers/content.helper';
import translator from '../../website/common/script/content/translation';

describe('Translator', () => {
  it('returns error message if string is not properly formatted', () => {
    const improperlyFormattedString = translator('petName', { attr: 0 })();
    expect(improperlyFormattedString).to.match(STRING_ERROR_MSG);
  });

  it('returns an error message if string does not exist', () => {
    const stringDoesNotExist = translator('stringDoesNotExist')();
    expect(stringDoesNotExist).to.match(STRING_DOES_NOT_EXIST_MSG);
  });
});
