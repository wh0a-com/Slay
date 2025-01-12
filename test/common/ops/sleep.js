import sleep from '../../../website/common/script/ops/sleep';
import {generateUser,} from '../../helpers/common.helper';

describe('shared.ops.sleep', () => {
  it('toggles user.preferences.sleep', () => {
    const user = generateUser();

    const [res] = sleep(user);
    expect(res).to.eql(true);
    expect(user.preferences.sleep).to.equal(true);

    const [res2] = sleep(user);
    expect(res2).to.eql(false);
    expect(user.preferences.sleep).to.equal(false);
  });
});
