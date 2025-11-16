class MR_GreenPuff : Actor
{
  Default
  {
    Radius 4;
    Height 4;
    RenderStyle Add;
    Alpha 0.7;
    Scale 0.8;
    +NOBLOCKMAP +NOGRAVITY +NOINTERACTION
    SeeSound ""
  }

  States
  {
  Spawn:
    MRPUF A 4 Bright;
    MRPUF A 4 Bright A_FadeOut(0.1);
    Stop;
  }
}

class MR_Enemy : Actor
{
  Default
  {
    Radius 10;
    Height 24;
    Speed 8;
    Health 1;
    PainChance 0;
    +NOBLOOD +NOPAIN +FLOORCLIP +NOEXTREMEDEATH
    SeeSound ""
    DeathSound ""
  }

  override void PostBeginPlay()
  {
    Super.PostBeginPlay();
    if (level != null)
    {
      A_SetPitch(0);
    }
  }

  States
  {
  Spawn:
    ENEM A 4 A_Chase;
    Loop;
  Death:
    ENEM A 4;
    Stop;
  }

  void Pop()
  {
    Spawn("MR_GreenPuff", Pos, ALLOW_REPLACE);
    Destroy();
  }

  void VolleyAt(PlayerPawn p, int dmg)
  {
    if (p == null)
      return;
    A_StartSound("mr/volley", CHAN_BODY);
    MR_Player player = MR_Player(p);
    if (player != null)
      player.ApplyVolleyDamage(dmg);
  }
}
