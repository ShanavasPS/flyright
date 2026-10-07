import cv2, numpy as np, sys
SP=sys.argv[1]; ZOOM=1.02
S=np.load(f"{SP}/S.npy"); Q0=S[0]
for i in range(48):
    # the phone's rigid motion since frame 1, undone, then a small zoom to hide the borders
    A,_=cv2.estimateAffinePartial2D(Q0,S[i])
    inv=cv2.invertAffineTransform(A)
    Z=cv2.getRotationMatrix2D((640,360),0,ZOOM)
    M=np.vstack([Z,[0,0,1]])@np.vstack([inv,[0,0,1]])
    f=cv2.imread(f"{SP}/out/{i+1:03d}.png")
    cv2.imwrite(f"{SP}/stab/{i+1:03d}.png",cv2.warpAffine(f,M[:2],(1280,720),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT))
print("ok")
