/* eslint-disable camelcase */

import mongoose from 'mongoose';
import _ from 'lodash';
import couponCode from 'coupon-code';
import shared from '../../common';
import baseModel from '../libs/baseModel';
import {BadRequest, NotAuthorized,} from '../libs/errors';

export const schema = new mongoose.Schema({
  _id: { $type: String, default: couponCode.generate, required: true },
  event: { $type: String, enum: ['wondercon', 'google_6mo'] },
  user: { $type: String, ref: 'User' },
}, {
  strict: true,
  minimize: false, // So empty objects are returned
  typeKey: '$type', // So that we can use fields named `type`
});

schema.plugin(baseModel, {
  timestamps: true,
  _id: false,
});

schema.statics.generate = async function generateCoupons (event, count = 1) {
  const coupons = _.times(count, () => ({ event }));

  return this.create(coupons);
};

schema.statics.apply = async function applyCoupon (user, req, code) {
  const coupon = await this.findById(couponCode.validate(code)).exec();
  if (!coupon) throw new BadRequest(shared.i18n.t('invalidCoupon', req.language));
  if (coupon.user) throw new NotAuthorized(shared.i18n.t('couponUsed', req.language));

  if (coupon.event === 'wondercon') {
    user.items.gear.owned.eyewear_special_wondercon_red = true;
    user.items.gear.owned.eyewear_special_wondercon_black = true;
    user.items.gear.owned.back_special_wondercon_black = true;
    user.items.gear.owned.back_special_wondercon_red = true;
    user.items.gear.owned.body_special_wondercon_red = true;
    user.items.gear.owned.body_special_wondercon_black = true;
    user.items.gear.owned.body_special_wondercon_gold = true;
    user.markModified('items.gear.owned');

    user.extra = { signupEvent: 'wondercon' };
  }

  await user.save();
  coupon.user = user._id;
  await coupon.save();
};

export const model = mongoose.model('Coupon', schema);
