import {generateNext, generateReq, generateRes,} from '../../../helpers/api-unit.helper';

import errorHandler from '../../../../website/server/middlewares/errorHandler';
import responseMiddleware from '../../../../website/server/middlewares/response';
import {attachTranslateFunction, getUserLanguage,} from '../../../../website/server/middlewares/language';

import {BadRequest} from '../../../../website/server/libs/errors';
import logger from '../../../../website/server/libs/logger';

describe('errorHandler', () => {
  let res; let req; let
    next;

  beforeEach(() => {
    res = generateRes();
    req = generateReq();
    next = generateNext();
    responseMiddleware(req, res, next);
    getUserLanguage(req, res, next);
    attachTranslateFunction(req, res, next);

    sandbox.stub(logger, 'error');
  });

  it('sends internal server error if error is not a CustomError and is not identified', () => {
    const error = new Error();

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(500);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });
  });

  it('identifies errors with statusCode property and format them correctly', () => {
    const error = new Error('Error message');
    error.statusCode = 400;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'Error',
      message: 'Error message',
    });
  });

  it('doesn\'t leak info about 500 errors', () => {
    const error = new Error('Some secret error message');
    error.statusCode = 500;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(500);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    });
  });

  it('sends CustomError', () => {
    const error = new BadRequest();

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'Bad request.',
    });
  });

  it('handle http-errors errors', () => {
    const error = new Error('custom message');
    error.statusCode = 422;

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(error.statusCode);
    expect(res.json).to.be.calledWith({
      success: false,
      error: error.name,
      message: error.message,
    });
  });

  it('handle express-validator errors', () => {
    const error = [{ param: 'param', msg: 'invalid param', value: 123 }];

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'Invalid request parameters.',
      errors: [
        { param: error[0].param, value: error[0].value, message: error[0].msg },
      ],
    });
  });

  it('handle Mongoose Validation errors', () => {
    const error = new Error('User validation failed');
    error.name = 'ValidationError';

    error.errors = {
      'auth.local.email': {
        path: 'auth.local.email',
        message: 'Invalid email.',
        value: 'not an email',
      },
    };

    errorHandler(error, req, res, next);

    expect(res.status).to.be.calledOnce;
    expect(res.json).to.be.calledOnce;

    expect(res.status).to.be.calledWith(400);
    expect(res.json).to.be.calledWith({
      success: false,
      error: 'BadRequest',
      message: 'User validation failed',
      errors: [
        { path: 'auth.local.email', message: 'Invalid email.', value: 'not an email' },
      ],
    });
  });

  it('logs error', () => {
    const error = new BadRequest();

    errorHandler(error, req, res, next);

    expect(logger.error).to.be.calledOnce;
    expect(logger.error).to.be.calledWithExactly(error, {
      method: req.method,
      originalUrl: req.originalUrl,
      headers: req.headers,
      body: req.body,
      query: req.query,
      httpCode: 400,
      isHandledError: true,
    });
  });
});
