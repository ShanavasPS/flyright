import cv2, numpy as np, sys, json
SP=sys.argv[1]
Hs=[np.array(h) for h in json.load(open(f"{SP}/H.json"))]
rect=np.float32([[0,0],[1206,0],[1206,2622],[0,2622]]).reshape(-1,1,2)
C=np.array([cv2.perspectiveTransform(rect,H).reshape(-1,2) for H in Hs])
size=np.array([[np.linalg.norm(c[1]-c[0]),np.linalg.norm(c[3]-c[0])] for c in C])
ok=(np.abs(size[:,0]-300)<20)&(np.abs(size[:,1]-645)<25)
frames=[cv2.imread(f"{SP}/hand/{i:03d}.png",cv2.IMREAD_GRAYSCALE) for i in range(1,49)]
# phone region in frame 1 (screen quad grown to include the bezel)
q1=np.median(C[ok],0)
mask=np.zeros_like(frames[0]); cv2.fillConvexPoly(mask,np.int32(q1+ (q1-q1.mean(0))*0.06),255)
sift=cv2.SIFT_create(3000)
k0,d0=sift.detectAndCompute(frames[0],mask)
bf=cv2.BFMatcher()
T=[np.eye(3)]
for i in range(1,48):
    ki,di=sift.detectAndCompute(frames[i],None)
    m=[a for a,b in bf.knnMatch(d0,di,k=2) if a.distance<0.7*b.distance]
    s=np.float32([k0[a.queryIdx].pt for a in m]); d=np.float32([ki[a.trainIdx].pt for a in m])
    A,inl=cv2.estimateAffinePartial2D(s,d,method=cv2.RANSAC,ransacReprojThreshold=1.5,maxIters=5000,refineIters=50)
    T.append(np.vstack([A,[0,0,1]]))
T=np.array(T)
# one fixed screen shape in frame-1 coordinates: median of the good absolute fits pulled back to frame 1
back=[cv2.perspectiveTransform(C[i].reshape(-1,1,2).astype(np.float32),np.linalg.inv(T[i])).reshape(-1,2) for i in range(48) if ok[i]]
Q0=np.median(np.array(back),0)
# light smoothing of the rigid motion (shift, angle, scale) only
p=np.array([[t[0,2],t[1,2],np.arctan2(t[1,0],t[0,0]),np.hypot(t[0,0],t[1,0])] for t in T])
k=3; pad=np.pad(p,((k//2,k//2),(0,0)),mode='edge'); ps=np.array([pad[i:i+k].mean(0) for i in range(48)])
S=[]
for tx,ty,a,sc in ps:
    M=np.array([[sc*np.cos(a),-sc*np.sin(a),tx],[sc*np.sin(a),sc*np.cos(a),ty],[0,0,1]])
    S.append(cv2.perspectiveTransform(Q0.reshape(-1,1,2).astype(np.float32),M).reshape(-1,2))
S=np.array(S)
old=C.copy()
jit=lambda X: np.abs(np.diff(X,2,axis=0)).mean()
print("raw fit jitter %.2f px, new track jitter %.2f px"%(jit(np.where(ok[:,None,None],old,S)),jit(S)))
np.save(f"{SP}/S.npy",S)
