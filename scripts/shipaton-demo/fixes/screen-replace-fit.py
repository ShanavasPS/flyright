import cv2, numpy as np, sys, glob, json
SP=sys.argv[1]
lock=cv2.imread(f"{SP}/lock.png",cv2.IMREAD_GRAYSCALE)
sift=cv2.SIFT_create(4000)
kL,dL=sift.detectAndCompute(lock,None)
bf=cv2.BFMatcher()
Hs=[]
for i in range(1,49):
    f=cv2.imread(f"{SP}/hand/{i:03d}.png")
    g=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY)
    # upscale the phone region so the scales are closer
    kF,dF=sift.detectAndCompute(g,None)
    m=bf.knnMatch(dL,dF,k=2)
    good=[a for a,b in m if a.distance<0.75*b.distance]
    src=np.float32([kL[a.queryIdx].pt for a in good]); dst=np.float32([kF[a.trainIdx].pt for a in good])
    H,inl=cv2.findHomography(src,dst,cv2.RANSAC,3.0)
    Hs.append(H.tolist())
    c=cv2.perspectiveTransform(np.float32([[[0,0]],[[1206,0]],[[1206,2622]],[[0,2622]]]),H).reshape(-1,2)
    print(i,len(good),int(inl.sum()),np.round(c,1).tolist())
json.dump(Hs,open(f"{SP}/H.json","w"))
