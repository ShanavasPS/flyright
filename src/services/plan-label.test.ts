import { planLabel } from './plan-label';

describe('plan names', () => {
  it('reads the plan from any store id', () => {
    expect(planLabel('flyright_pro_monthly')).toBe('Monthly');
    expect(planLabel('flyright_pro_monthly:monthly')).toBe('Monthly');
    expect(planLabel('flyright_pro_monthly_trial_web')).toBe('Monthly');
    expect(planLabel('flyright_pro_yearly')).toBe('Yearly');
    expect(planLabel('flyright_pro_annual:annual')).toBe('Yearly');
    expect(planLabel('flyright_pro_lifetime_web_v2')).toBe('Lifetime');
    expect(planLabel('monthly')).toBe('Monthly');
  });

  it('names a RevenueCat grant and never shows a raw id', () => {
    expect(planLabel('rc_promo_Owed Pro_custom')).toBe('Complimentary');
    expect(planLabel('something_else')).toBe('Pro');
  });
});
