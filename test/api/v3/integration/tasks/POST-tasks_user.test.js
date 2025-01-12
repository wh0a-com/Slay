import {v4 as generateUUID} from 'uuid';
import {generateUser, server, sleep, translate as t,} from '../../../../helpers/api-integration/v3';

describe('POST /tasks/user', () => {
  let user;
  let tzoffset;

  before(async () => {
    tzoffset = new Date().getTimezoneOffset();
  });

  beforeEach(async () => {
    user = await generateUser({ 'preferences.timezoneOffset': tzoffset });
  });

  context('validates params', async () => {
    it('returns an error if req.body.type is absent', async () => {
      await expect(user.post('/tasks/user', {
        notType: 'habit',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidTaskType'),
      });
    });

    it('returns an error if req.body.type is not valid', async () => {
      await expect(user.post('/tasks/user', {
        type: 'habitF',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidTaskType'),
      });
    });

    it('returns an error if one object inside an array is invalid', async () => {
      await expect(user.post('/tasks/user', [
        { type: 'habitF' },
        { type: 'habit' },
      ])).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('invalidTaskType'),
      });
    });

    it('returns an error if req.body.text is absent', async () => {
      await expect(user.post('/tasks/user', {
        type: 'habit',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'habit validation failed',
      });
    });

    it('returns an error if reward value is a negative number', async () => {
      await expect(user.post('/tasks/user', {
        type: 'reward',
        text: 'reward with negative value',
        value: -10,
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'reward validation failed',
      });
    });

    it('does not update user.tasksOrder.{taskType} when the task is not saved because invalid', async () => {
      const originalHabitsOrder = (await user.get('/user')).tasksOrder.habits;
      await expect(user.post('/tasks/user', {
        type: 'habit',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'habit validation failed',
      });

      const updatedHabitsOrder = (await user.get('/user')).tasksOrder.habits;
      expect(updatedHabitsOrder).to.eql(originalHabitsOrder);
    });

    it('does not update user.tasksOrder.{taskType} when a task inside an array is not saved because invalid', async () => {
      const originalHabitsOrder = (await user.get('/user')).tasksOrder.habits;
      await expect(user.post('/tasks/user', [
        { type: 'habit' }, // Missing text
        { type: 'habit', text: 'valid' }, // Valid
      ])).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'habit validation failed',
      });

      const updatedHabitsOrder = (await user.get('/user')).tasksOrder.habits;
      expect(updatedHabitsOrder).to.eql(originalHabitsOrder);
    });

    it('does not save any task sent in an array when 1 is invalid', async () => {
      const originalTasks = await user.get('/tasks/user');
      await expect(user.post('/tasks/user', [
        { type: 'habit' }, // Missing text
        { type: 'habit', text: 'valid' }, // Valid
      ])).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'habit validation failed',
      }).then(async () => {
        const updatedTasks = await user.get('/tasks/user');

        expect(updatedTasks).to.eql(originalTasks);
      });
    });

    it('automatically sets "task.userId" to user\'s uuid', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
      });

      expect(task.userId).to.equal(user._id);
    });

    it(`ignores setting userId, history, createdAt,
                        updatedAt, challenge, completed,
                        dateCompleted fields`, async () => {
      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        userId: 123,
        history: [123],
        createdAt: 'yesterday',
        updatedAt: 'tomorrow',
        challenge: 'no',
        completed: true,
        dateCompleted: 'never',
        value: 324, // ignored because not a reward
      });

      expect(task.userId).to.equal(user._id);
      expect(task.history).to.eql([]);
      expect(task.createdAt).not.to.equal('yesterday');
      expect(task.updatedAt).not.to.equal('tomorrow');
      expect(task.challenge).not.to.equal('no');
      expect(task.completed).to.equal(false);
      expect(task.dateCompleted).not.to.equal('never');
      expect(task.value).not.to.equal(324);
      expect(task.yesterDaily).to.equal(true);
    });

    it('ignores invalid fields', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        notValid: true,
      });

      expect(task).not.to.have.property('notValid');
    });

    it('errors if alias already exists on another task', async () => {
      await user.post('/tasks/user', { // first task that will succeed
        type: 'habit',
        text: 'todo text',
        alias: 'alias',
      });

      await expect(user.post('/tasks/user', {
        type: 'todo',
        text: 'todo text',
        alias: 'alias',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'todo validation failed',
      });
    });

    it('errors if alias contains invalid values', async () => {
      await expect(user.post('/tasks/user', {
        type: 'todo',
        text: 'todo text',
        alias: 'short name!',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'todo validation failed',
      });
    });

    it('errors if alias is a valid uuid', async () => {
      await expect(user.post('/tasks/user', {
        type: 'todo',
        text: 'todo text',
        alias: generateUUID(),
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'todo validation failed',
      });
    });

    it('errors if the same shortname is used on 2 or more tasks', async () => {
      await expect(user.post('/tasks/user', [{
        type: 'habit',
        text: 'habit text',
        alias: 'alias',
      }, {
        type: 'todo',
        text: 'todo text',
      }, {
        type: 'todo',
        text: 'todo text',
        alias: 'alias',
      }])).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: t('taskAliasAlreadyUsed'),
      });
    });
  });

  it('errors if todo due date supplied is an invalid date', async () => {
    await expect(user.post('/tasks/user', {
      type: 'todo',
      text: 'todo text',
      date: 'invalid date',
    })).to.eventually.be.rejected.and.eql({
      code: 400,
      error: 'BadRequest',
      message: 'todo validation failed',
    });
  });

  context('sending task activity webhooks', () => {
    before(async () => {
      await server.start();
    });

    after(async () => {
      await server.close();
    });

    it('sends task activity webhooks', async () => {
      const uuid = generateUUID();

      await user.post('/user/webhook', {
        url: `http://localhost:${server.port}/webhooks/${uuid}`,
        type: 'taskActivity',
        enabled: true,
        options: {
          created: true,
        },
      });

      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
      });

      await sleep();

      const body = server.getWebhookData(uuid);

      expect(body.task).to.eql(task);
    });

    it('sends a task activity webhook for each task', async () => {
      const uuid = generateUUID();

      await user.post('/user/webhook', {
        url: `http://localhost:${server.port}/webhooks/${uuid}`,
        type: 'taskActivity',
        enabled: true,
        options: {
          created: true,
        },
      });

      const tasks = await user.post('/tasks/user', [{
        text: 'test habit',
        type: 'habit',
      }, {
        text: 'test todo',
        type: 'todo',
      }]);

      await sleep();

      const taskBodies = [
        server.getWebhookData(uuid),
        server.getWebhookData(uuid),
      ];

      expect(taskBodies.find(body => body.task.id === tasks[0].id)).to.exist;
      expect(taskBodies.find(body => body.task.id === tasks[1].id)).to.exist;
    });
  });

  context('all types', () => {
    it('can create reminders', async () => {
      const id1 = generateUUID();

      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        reminders: [
          { id: id1, startDate: new Date(), time: new Date() },
        ],
      });

      expect(task.reminders).to.be.an('array');
      expect(task.reminders.length).to.eql(1);
      expect(task.reminders[0]).to.be.an('object');
      expect(task.reminders[0].id).to.eql(id1);
      expect(task.reminders[0].startDate).to.be.a('string'); // json doesn't have dates
      expect(task.reminders[0].time).to.be.a('string');
    });

    it('can create a task with a alias', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        alias: 'a_alias012',
      });

      expect(task.alias).to.eql('a_alias012');
    });

    // This is a special case for iOS requests
    it('will round a priority (difficulty)', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        priority: 0.10000000000005,
      });

      expect(task.priority).to.eql(0.1);
    });
  });

  context('habits', () => {
    it('creates a habit', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        up: false,
        down: true,
        notes: 1976,
      });

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test habit');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('habit');
      expect(task.up).to.eql(false);
      expect(task.down).to.eql(true);
    });

    it('updates user.tasksOrder.habits when a new habit is created', async () => {
      const originalHabitsOrderLen = (await user.get('/user')).tasksOrder.habits.length;
      const task = await user.post('/tasks/user', {
        type: 'habit',
        text: 'an habit',
      });

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.habits[0]).to.eql(task._id);
      expect(updatedUser.tasksOrder.habits.length).to.eql(originalHabitsOrderLen + 1);
    });

    it('updates user.tasksOrder.habits when multiple habits are created', async () => {
      const originalHabitsOrderLen = (await user.get('/user')).tasksOrder.habits.length;
      const [task, task2] = await user.post('/tasks/user', [{
        type: 'habit',
        text: 'an habit',
      }, {
        type: 'habit',
        text: 'another habit',
      }]);

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.habits[0]).to.eql(task2._id);
      expect(updatedUser.tasksOrder.habits[1]).to.eql(task._id);
      expect(updatedUser.tasksOrder.habits.length).to.eql(originalHabitsOrderLen + 2);
    });

    it('creates multiple habits', async () => {
      const [task, task2] = await user.post('/tasks/user', [{
        text: 'test habit',
        type: 'habit',
        up: false,
        down: true,
        notes: 1976,
      }, {
        text: 'test habit 2',
        type: 'habit',
        up: true,
        down: false,
        notes: 1977,
      }]);

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test habit');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('habit');
      expect(task.up).to.eql(false);
      expect(task.down).to.eql(true);

      expect(task2.userId).to.equal(user._id);
      expect(task2.text).to.eql('test habit 2');
      expect(task2.notes).to.eql('1977');
      expect(task2.type).to.eql('habit');
      expect(task2.up).to.eql(true);
      expect(task2.down).to.eql(false);
    });

    it('defaults to setting up and down to true', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        notes: 1976,
      });

      expect(task.up).to.eql(true);
      expect(task.down).to.eql(true);
    });

    it('cannot create checklists', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test habit',
        type: 'habit',
        checklist: [
          { _id: 123, completed: false, text: 'checklist' },
        ],
      });

      expect(task).not.to.have.property('checklist');
    });
  });

  context('todos', () => {
    it('creates a todo', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test todo',
        type: 'todo',
        notes: 1976,
      });

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test todo');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('todo');
    });

    it('creates multiple todos', async () => {
      const [task, task2] = await user.post('/tasks/user', [{
        text: 'test todo',
        type: 'todo',
        notes: 1976,
      }, {
        text: 'test todo 2',
        type: 'todo',
        notes: 1977,
      }]);

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test todo');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('todo');

      expect(task2.userId).to.equal(user._id);
      expect(task2.text).to.eql('test todo 2');
      expect(task2.notes).to.eql('1977');
      expect(task2.type).to.eql('todo');
    });

    it('updates user.tasksOrder.todos when a new todo is created', async () => {
      const originalTodosOrderLen = (await user.get('/user')).tasksOrder.todos.length;
      const task = await user.post('/tasks/user', {
        type: 'todo',
        text: 'a todo',
      });

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.todos[0]).to.eql(task._id);
      expect(updatedUser.tasksOrder.todos.length).to.eql(originalTodosOrderLen + 1);
    });

    it('updates user.tasksOrder.todos when multiple todos are created', async () => {
      const originalTodosOrderLen = (await user.get('/user')).tasksOrder.todos.length;
      const [task, task2] = await user.post('/tasks/user', [{
        type: 'todo',
        text: 'a todo',
      }, {
        type: 'todo',
        text: 'another todo',
      }]);

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.todos[0]).to.eql(task2._id);
      expect(updatedUser.tasksOrder.todos[1]).to.eql(task._id);
      expect(updatedUser.tasksOrder.todos.length).to.eql(originalTodosOrderLen + 2);
    });

    it('can create checklists', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test todo',
        type: 'todo',
        checklist: [
          { completed: false, text: 'checklist' },
        ],
      });

      expect(task.checklist).to.be.an('array');
      expect(task.checklist.length).to.eql(1);
      expect(task.checklist[0]).to.be.an('object');
      expect(task.checklist[0].text).to.eql('checklist');
      expect(task.checklist[0].completed).to.eql(false);
      expect(task.checklist[0].id).to.be.a('string');
    });
  });

  context('dailys', () => {
    it('creates a daily', async () => {
      const now = new Date();

      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        notes: 1976,
        frequency: 'daily',
        everyX: 5,
        startDate: now,
        daysOfMonth: [15],
        weeksOfMonth: [3],
      });

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test daily');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('daily');
      expect(task.frequency).to.eql('daily');
      expect(task.everyX).to.eql(5);
      expect(task.daysOfMonth).to.eql([15]);
      expect(task.weeksOfMonth).to.eql([3]);
      expect(new Date(task.startDate)).to.eql(new Date(now.setHours(0, 0, 0, 0)));
      expect(task.isDue).to.be.true;
      expect(task.nextDue.length).to.eql(6);
    });

    it('creates multiple dailys', async () => {
      const [task, task2] = await user.post('/tasks/user', [{
        text: 'test daily',
        type: 'daily',
        notes: 1976,
      }, {
        text: 'test daily 2',
        type: 'daily',
        notes: 1977,
      }]);

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test daily');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('daily');

      expect(task2.userId).to.equal(user._id);
      expect(task2.text).to.eql('test daily 2');
      expect(task2.notes).to.eql('1977');
      expect(task2.type).to.eql('daily');
    });

    it('updates user.tasksOrder.dailys when a new daily is created', async () => {
      const originalDailysOrderLen = (await user.get('/user')).tasksOrder.dailys.length;
      const task = await user.post('/tasks/user', {
        type: 'daily',
        text: 'a daily',
      });

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.dailys[0]).to.eql(task._id);
      expect(updatedUser.tasksOrder.dailys.length).to.eql(originalDailysOrderLen + 1);
    });

    it('updates user.tasksOrder.dailys when multiple dailys are created', async () => {
      const originalDailysOrderLen = (await user.get('/user')).tasksOrder.dailys.length;
      const [task, task2] = await user.post('/tasks/user', [{
        type: 'daily',
        text: 'a daily',
      }, {
        type: 'daily',
        text: 'another daily',
      }]);

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.dailys[0]).to.eql(task2._id);
      expect(updatedUser.tasksOrder.dailys[1]).to.eql(task._id);
      expect(updatedUser.tasksOrder.dailys.length).to.eql(originalDailysOrderLen + 2);
    });

    it('defaults to a weekly frequency, with every day set', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
      });

      expect(task.frequency).to.eql('weekly');
      expect(task.everyX).to.eql(1);
      expect(task.repeat).to.eql({
        m: true,
        t: true,
        w: true,
        th: true,
        f: true,
        s: true,
        su: true,
      });
    });

    it('allows repeat field to be configured', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        repeat: {
          m: false,
          w: false,
          su: false,
        },
      });

      expect(task.repeat).to.eql({
        m: false,
        t: true,
        w: false,
        th: true,
        f: true,
        s: true,
        su: false,
      });
    });

    it('defaults startDate to today', async () => {
      const today = (new Date()).getDay();

      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
      });

      expect((new Date(task.startDate)).getDay()).to.eql(today);
    });

    it('returns an error if the start date is empty', async () => {
      await expect(user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        startDate: '',
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'daily validation failed',
      });
    });

    it('returns an error if everyX is a non int', async () => {
      await expect(user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        everyX: 2.5,
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'daily validation failed',
      });
    });

    it('returns an error if everyX is negative', async () => {
      await expect(user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        everyX: -1,
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'daily validation failed',
      });
    });

    it('returns an error if everyX is above 9999', async () => {
      await expect(user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        everyX: 10000,
      })).to.eventually.be.rejected.and.eql({
        code: 400,
        error: 'BadRequest',
        message: 'daily validation failed',
      });
    });

    it('can create checklists', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test daily',
        type: 'daily',
        checklist: [
          { completed: false, text: 'checklist' },
        ],
      });

      expect(task.checklist).to.be.an('array');
      expect(task.checklist.length).to.eql(1);
      expect(task.checklist[0]).to.be.an('object');
      expect(task.checklist[0].text).to.eql('checklist');
      expect(task.checklist[0].completed).to.eql(false);
      expect(task.checklist[0].id).to.be.a('string');
    });
  });

  context('rewards', () => {
    it('creates a reward', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test reward',
        type: 'reward',
        notes: 1976,
        value: 10,
      });

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test reward');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('reward');
      expect(task.value).to.eql(10);
    });

    it('creates multiple rewards', async () => {
      const [task, task2] = await user.post('/tasks/user', [{
        text: 'test reward',
        type: 'reward',
        notes: 1976,
        value: 11,
      }, {
        text: 'test reward 2',
        type: 'reward',
        notes: 1977,
        value: 12,
      }]);

      expect(task.userId).to.equal(user._id);
      expect(task.text).to.eql('test reward');
      expect(task.notes).to.eql('1976');
      expect(task.type).to.eql('reward');
      expect(task.value).to.eql(11);

      expect(task2.userId).to.equal(user._id);
      expect(task2.text).to.eql('test reward 2');
      expect(task2.notes).to.eql('1977');
      expect(task2.type).to.eql('reward');
      expect(task2.value).to.eql(12);
    });

    it('updates user.tasksOrder.rewards when a new reward is created', async () => {
      const originalRewardsOrderLen = (await user.get('/user')).tasksOrder.rewards.length;
      const task = await user.post('/tasks/user', {
        type: 'reward',
        text: 'a reward',
      });

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.rewards[0]).to.eql(task._id);
      expect(updatedUser.tasksOrder.rewards.length).to.eql(originalRewardsOrderLen + 1);
    });

    it('updates user.tasksOrder.dreward when multiple rewards are created', async () => {
      const originalRewardsOrderLen = (await user.get('/user')).tasksOrder.rewards.length;
      const [task, task2] = await user.post('/tasks/user', [{
        type: 'reward',
        text: 'a reward',
      }, {
        type: 'reward',
        text: 'another reward',
      }]);

      const updatedUser = await user.get('/user');
      expect(updatedUser.tasksOrder.rewards[0]).to.eql(task2._id);
      expect(updatedUser.tasksOrder.rewards[1]).to.eql(task._id);
      expect(updatedUser.tasksOrder.rewards.length).to.eql(originalRewardsOrderLen + 2);
    });

    it('defaults to a 0 value', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test reward',
        type: 'reward',
      });

      expect(task.value).to.eql(0);
    });

    it('requires value to be coerced into a number', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test reward',
        type: 'reward',
        value: '10',
      });

      expect(task.value).to.eql(10);
    });

    it('cannot create checklists', async () => {
      const task = await user.post('/tasks/user', {
        text: 'test reward',
        type: 'reward',
        checklist: [
          { _id: 123, completed: false, text: 'checklist' },
        ],
      });

      expect(task).not.to.have.property('checklist');
    });
  });
});
