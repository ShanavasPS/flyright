import { inviteTokenFrom } from './circle';

describe('inviteTokenFrom', () => {
  it('reads the token out of every link the traveller could have copied', () => {
    expect(inviteTokenFrom('https://getflyright.com/i/5hrf5BZ8Y7EAxOSbPnDi2K')).toBe(
      '5hrf5BZ8Y7EAxOSbPnDi2K',
    );
    expect(inviteTokenFrom('flyright://i/5hrf5BZ8Y7EAxOSbPnDi2K')).toBe('5hrf5BZ8Y7EAxOSbPnDi2K');
    expect(inviteTokenFrom('https://flyright.godetour.link/0tItTZgtyO/i/tok_9X-y1234')).toBe(
      'tok_9X-y1234',
    );
  });

  it('survives the message the link arrived inside', () => {
    expect(
      inviteTokenFrom(
        "Follow Sam's trips on FlyRight — a heads-up the day before each flight and live " +
          'updates on travel day: https://getflyright.com/i/5hrf5BZ8Y7EAxOSbPnDi2K',
      ),
    ).toBe('5hrf5BZ8Y7EAxOSbPnDi2K');
    expect(inviteTokenFrom('  https://getflyright.com/i/5hrf5BZ8Y7EAxOSbPnDi2K?utm=wa  ')).toBe(
      '5hrf5BZ8Y7EAxOSbPnDi2K',
    );
  });

  it('refuses anything that is not an invite link', () => {
    expect(inviteTokenFrom('https://getflyright.com/t/5hrf5BZ8Y7EAxOSbPnDi2K')).toBeNull();
    expect(inviteTokenFrom('https://getflyright.com/i/short')).toBeNull();
    expect(inviteTokenFrom('just some text I had copied')).toBeNull();
    expect(inviteTokenFrom('')).toBeNull();
  });
});
