import cv2, numpy as np, sys, json
SP=sys.argv[1]
W,Hh=1206,2622
rect=np.float32([[0,0],[W,0],[W,Hh],[0,Hh]]).reshape(-1,1,2)
S=np.load(f'{SP}/S.npy')  # rigid track from track.py
# work at a third of the raw size to keep the warp anti-aliased
s=3; w,h=W//s,Hh//s
src=np.float32([[0,0],[w,0],[w,h],[0,h]])
mask=np.zeros((h,w),np.uint8); r=170//s
cv2.rectangle(mask,(r,0),(w-r,h),255,-1); cv2.rectangle(mask,(0,r),(w,h-r),255,-1)
for cx,cy in [(r,r),(w-r,r),(w-r,h-r),(r,h-r)]: cv2.circle(mask,(cx,cy),r,255,-1)
for i in range(48):
    f=cv2.imread(f"{SP}/hand/{i+1:03d}.png").astype(np.float32)
    b=cv2.imread(f"{SP}/belt/{i+1:03d}.png")
    b=cv2.resize(b,(w,h),interpolation=cv2.INTER_AREA)
    M=cv2.getPerspectiveTransform(src,S[i].astype(np.float32))
    wb=cv2.warpPerspective(b,M,(1280,720),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    wm=cv2.warpPerspective(mask,M,(1280,720),flags=cv2.INTER_LINEAR).astype(np.float32)/255
    # reach the bezel: grow the screen 2.5 px so no lock-screen wallpaper shows at the edge
    wm=cv2.dilate(wm,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))
    wm=cv2.GaussianBlur(wm,(0,0),0.8)
    # match the clip's softness and exposure
    wb=cv2.GaussianBlur(wb,(0,0),0.6)*0.92
    # fingers stay in front: warm, bright pixels of the original over the screen
    B,G,R=f[...,0],f[...,1],f[...,2]
    skin=((R>95)&(R-B>22)).astype(np.float32)
    skin=cv2.dilate(skin,np.ones((3,3),np.uint8)); skin=cv2.GaussianBlur(skin,(0,0),1.2)
    a=(wm*(1-skin))[...,None]
    out=f*(1-a)+wb*a
    cv2.imwrite(f"{SP}/out/{i+1:03d}.png",np.clip(out,0,255).astype(np.uint8))
print("ok")
