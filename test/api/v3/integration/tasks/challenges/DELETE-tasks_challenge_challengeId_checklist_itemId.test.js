import {v4 as generateUUID} from 'uuid';
import {
  generateChallenge,
  generateGroup,
  generateUser,
  translate as t,
} from '../../../../../helpers/api-integration/v3';

describe('DELETE /tasks/:taskId/checklist/:itemId', () => {
  let user;
  let guild;
  let challenge;

  before(async () => {
    user = await generateUser();
    guild = await generateGroup(user);
    challenge = await generateChallenge(user, guild);
    await user.post(`/challenges/${challenge._id}/join`);
  });

  it('fails on task not found', async () => {
    await expect(user.del(`/tasks/${generateUUID()}/checklist/${generateUUID()}`)).to.eventually.be.rejected.and.eql({
      code: 404,
      error: 'NotFound',
      message: t('messageTaskNotFound'),
    });
  });

  it('fails on checklist item not found', async () => {
    const createdTask = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'daily',
      text: 'daily with checklist',
    });

    await expect(user.del(`/tasks/${createdTask._id}/checklist/${generateUUID()}`)).to.eventually.be.rejected.and.eql({
      code: 404,
      error: 'NotFound',
      message: t('checklistItemNotFound'),
    });
  });

  it('returns error when user is not a member of the challenge', async () => {
    const task = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'daily',
      text: 'Daily with checklist',
    });

    const savedTask = await user.post(`/tasks/${task._id}/checklist`, {
      text: 'Checklist Item 1',
      completed: false,
    });

    const anotherUser = await generateUser();

    await expect(anotherUser.del(`/tasks/${task._id}/checklist/${savedTask.checklist[0].id}`))
      .to.eventually.be.rejected.and.eql({
        code: 401,
        error: 'NotAuthorized',
        message: t('onlyChalLeaderEditTasks'),
      });
  });

  it('deletes a checklist item from a daily', async () => {
    const task = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'daily',
      text: 'Daily with checklist',
    });

    let savedTask = await user.post(`/tasks/${task._id}/checklist`, { text: 'Checklist Item 1', completed: false });

    await user.del(`/tasks/${task._id}/checklist/${savedTask.checklist[0].id}`);
    savedTask = await user.get(`/tasks/${task._id}`);

    expect(savedTask.checklist.length).to.equal(0);
  });

  it('deletes a checklist item from a todo', async () => {
    const task = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'todo',
      text: 'Todo with checklist',
    });

    let savedTask = await user.post(`/tasks/${task._id}/checklist`, { text: 'Checklist Item 1', completed: false });

    await user.del(`/tasks/${task._id}/checklist/${savedTask.checklist[0].id}`);
    savedTask = await user.get(`/tasks/${task._id}`);

    expect(savedTask.checklist.length).to.equal(0);
  });

  it('does not work with habits', async () => {
    const habit = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'habit',
      text: 'habit with checklist',
    });

    await expect(user.del(`/tasks/${habit._id}/checklist/${generateUUID()}`)).to.eventually.be.rejected.and.eql({
      code: 400,
      error: 'BadRequest',
      message: t('checklistOnlyDailyTodo'),
    });
  });

  it('does not work with rewards', async () => {
    const reward = await user.post(`/tasks/challenge/${challenge._id}`, {
      type: 'reward',
      text: 'reward with checklist',
    });

    await expect(user.del(`/tasks/${reward._id}/checklist/${generateUUID()}`)).to.eventually.be.rejected.and.eql({
      code: 400,
      error: 'BadRequest',
      message: t('checklistOnlyDailyTodo'),
    });
  });
});
